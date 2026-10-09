import { and, asc, between, eq, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { categories, transactions } from "@/db/schema";
import type { FlowRow } from "@/lib/analytics/summary";

/** Income + expense rows (never transfers) in an inclusive date range, oldest first. */
export async function listFlowRows(from: string, to: string): Promise<FlowRow[]> {
  const db = await getDb();
  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      nature: categories.nature,
      isSystem: categories.isSystem,
      item: transactions.item,
      accountId: transactions.accountId,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(between(transactions.date, from, to), ne(transactions.type, "transfer")))
    .orderBy(asc(transactions.date), asc(transactions.id))
    .all();

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    type: r.type as "income" | "expense",
    amount: r.amount,
    categoryId: r.categoryId,
    categoryName: r.categoryName ?? "Uncategorised",
    categoryIcon: r.categoryIcon ?? "•",
    nature: r.nature ?? "want",
    isSystem: r.isSystem ?? false,
    item: r.item,
    accountId: r.accountId,
  }));
}
