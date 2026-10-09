import { asc, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accounts, categories, transactions } from "@/db/schema";
import type { Account, Category } from "@/db/schema";

export type CategoryWithUsage = Category & { usage: number };

export async function listAccounts(includeArchived = false): Promise<Account[]> {
  const db = await getDb();
  const q = db.select().from(accounts).orderBy(asc(accounts.sortOrder), asc(accounts.id));
  const rows = q.all();
  return includeArchived ? rows : rows.filter((a) => !a.archived);
}

/** Categories, most-used first within each type (drives the quick-add chip order). */
export async function listCategories(includeArchived = false): Promise<CategoryWithUsage[]> {
  const db = await getDb();
  const usage = new Map(
    db
      .select({ id: transactions.categoryId, n: count() })
      .from(transactions)
      .where(isNotNull(transactions.categoryId))
      .groupBy(transactions.categoryId)
      .all()
      .map((r) => [r.id as number, r.n]),
  );
  const rows = db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.id))
    .all()
    .filter((c) => includeArchived || !c.archived)
    .map((c) => ({ ...c, usage: usage.get(c.id) ?? 0 }));
  return rows.sort((a, b) => b.usage - a.usage || a.sortOrder - b.sortOrder);
}

export type ItemHint = {
  item: string;
  type: "income" | "expense";
  categoryId: number | null;
  amount: number;
  count: number;
};

/** Distinct past items with their last category/amount, so quick-add can autofill. */
export async function listItemHints(): Promise<ItemHint[]> {
  const db = await getDb();
  const rows = db
    .select({
      item: transactions.item,
      type: transactions.type,
      categoryId: transactions.categoryId,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(isNotNull(transactions.item))
    .orderBy(desc(transactions.id))
    .limit(3000)
    .all();
  const map = new Map<string, ItemHint>();
  for (const r of rows) {
    if (!r.item || r.type === "transfer") continue;
    const key = `${r.type}:${r.item.trim().toLowerCase()}`;
    const hit = map.get(key);
    if (hit) hit.count += 1;
    else
      map.set(key, {
        item: r.item.trim(),
        type: r.type,
        categoryId: r.categoryId,
        amount: r.amount,
        count: 1,
      });
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 400);
}

/** Account used by the most recent transaction of this type (default selection). */
export async function lastAccountId(): Promise<number | null> {
  const db = await getDb();
  const row = db
    .select({ id: transactions.accountId })
    .from(transactions)
    .orderBy(desc(transactions.id))
    .limit(1)
    .get();
  return row?.id ?? null;
}

export async function getSystemCategoryId(name: string): Promise<number | null> {
  const db = await getDb();
  return (
    db
      .select({ id: categories.id })
      .from(categories)
      .where(sql`${categories.name} = ${name} AND ${categories.isSystem} = 1`)
      .get()?.id ?? null
  );
}

export async function getAccount(id: number): Promise<Account | undefined> {
  const db = await getDb();
  return db.select().from(accounts).where(eq(accounts.id, id)).get();
}
