import { and, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/db/client";
import type { DB } from "@/db/open";
import { accounts, categories, transactions } from "@/db/schema";

export type TxFilters = {
  from?: string;
  to?: string;
  categoryId?: number;
  accountId?: number;
  type?: "income" | "expense" | "transfer";
  q?: string;
  limit?: number;
  offset?: number;
};

export type TxRow = {
  id: number;
  date: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  item: string | null;
  merchant: string | null;
  note: string | null;
  accountId: number;
  accountName: string;
  toAccountId: number | null;
  toAccountName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
};

function buildWhere(f: TxFilters): SQL | undefined {
  const parts: (SQL | undefined)[] = [];
  if (f.from) parts.push(gte(transactions.date, f.from));
  if (f.to) parts.push(lte(transactions.date, f.to));
  if (f.categoryId) parts.push(eq(transactions.categoryId, f.categoryId));
  if (f.type) parts.push(eq(transactions.type, f.type));
  if (f.accountId) {
    parts.push(or(eq(transactions.accountId, f.accountId), eq(transactions.toAccountId, f.accountId)));
  }
  if (f.q?.trim()) {
    const term = `%${f.q.trim()}%`;
    parts.push(
      or(
        like(transactions.item, term),
        like(transactions.merchant, term),
        like(transactions.note, term),
        like(categories.name, term),
      ),
    );
  }
  return and(...parts);
}

/** Sync on purpose: drizzle builders are thenable, so an async fn would execute the query early. */
function baseSelect(db: DB) {
  const toAcc = alias(accounts, "to_account");
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      amount: transactions.amount,
      item: transactions.item,
      merchant: transactions.merchant,
      note: transactions.note,
      accountId: transactions.accountId,
      accountName: accounts.name,
      toAccountId: transactions.toAccountId,
      toAccountName: toAcc.name,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(toAcc, eq(transactions.toAccountId, toAcc.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id));
}

export async function listTransactions(f: TxFilters = {}): Promise<TxRow[]> {
  const db = await getDb();
  return baseSelect(db)
    .where(buildWhere(f))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(f.limit ?? 200)
    .offset(f.offset ?? 0)
    .all();
}

export async function getTransaction(id: number): Promise<TxRow | undefined> {
  const db = await getDb();
  return baseSelect(db).where(eq(transactions.id, id)).get();
}

/**
 * Money moved between accounts, from one account's point of view: how much LEFT it (it is the "from" account) and how much
 * ARRIVED (it is the "to" account), over the same filters. Transfers are neither income nor spending, so this is the other
 * half of an account's story: opening + income - spending + in - out = balance.
 */
export async function sumTransferFlow(f: TxFilters, accountId: number): Promise<{ out: number; in: number }> {
  const db = await getDb();
  const row = db
    .select({
      out: sql<number>`coalesce(sum(case when ${transactions.accountId} = ${accountId} then ${transactions.amount} else 0 end), 0)`,
      into: sql<number>`coalesce(sum(case when ${transactions.toAccountId} = ${accountId} then ${transactions.amount} else 0 end), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(buildWhere({ ...f, type: "transfer", accountId }))
    .get();
  return { out: row?.out ?? 0, in: row?.into ?? 0 };
}

export type TxTotals = { income: number; expense: number; transfer: number; count: number };

/** Totals over the same filter set (ignores limit/offset). */
export async function sumTransactions(f: TxFilters = {}): Promise<TxTotals> {
  const db = await getDb();
  const rows = db
    .select({
      type: transactions.type,
      total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
      n: sql<number>`count(*)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(buildWhere(f))
    .groupBy(transactions.type)
    .all();
  const out: TxTotals = { income: 0, expense: 0, transfer: 0, count: 0 };
  for (const r of rows) {
    out[r.type] = r.total;
    out.count += r.n;
  }
  return out;
}
