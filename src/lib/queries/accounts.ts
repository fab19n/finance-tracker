import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { transactions } from "@/db/schema";
import type { Account } from "@/db/schema";
import { listAccounts } from "./reference";

export type AccountBalance = Account & {
  /** opening + income - expense - transfers out + transfers in (sen) */
  balance: number;
  /** transfers in minus transfers out - for investment accounts this is "money you put in". */
  netTransferred: number;
};

/** Ledger balance of every account, derived from transactions. Never stored. */
export async function getAccountBalances(includeArchived = false): Promise<AccountBalance[]> {
  const accs = await listAccounts(includeArchived);
  const db = await getDb();
  const sums = db
    .select({
      id: transactions.accountId,
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .groupBy(transactions.accountId, transactions.type)
    .all();
  const incoming = db
    .select({
      id: transactions.toAccountId,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(eq(transactions.type, "transfer"))
    .groupBy(transactions.toAccountId)
    .all();

  return accs.map((a) => {
    const mine = sums.filter((s) => s.id === a.id);
    const get = (t: string) => mine.find((s) => s.type === t)?.total ?? 0;
    const transfersIn = incoming.find((s) => s.id === a.id)?.total ?? 0;
    const transfersOut = get("transfer");
    return {
      ...a,
      balance: a.openingBalance + get("income") - get("expense") - transfersOut + transfersIn,
      netTransferred: transfersIn - transfersOut,
    };
  });
}

/**
 * Income and spending on the given accounts between two dates (both inclusive), transfers left out: what the net-worth
 * pill adds up. `count` is the number of entries, so "nothing happened" can be told from "it netted to zero".
 */
export async function getRecentFlow(accountIds: number[], from: string, to: string): Promise<{ income: number; expense: number; count: number }> {
  if (accountIds.length === 0) return { income: 0, expense: 0, count: 0 };
  const db = await getDb();
  const rows = db
    .select({ type: transactions.type, total: sql<number>`sum(${transactions.amount})`, n: sql<number>`count(*)` })
    .from(transactions)
    .where(and(inArray(transactions.accountId, accountIds), gte(transactions.date, from), lte(transactions.date, to), inArray(transactions.type, ["income", "expense"])))
    .groupBy(transactions.type)
    .all();
  const get = (t: string) => rows.find((r) => r.type === t);
  return { income: get("income")?.total ?? 0, expense: get("expense")?.total ?? 0, count: rows.reduce((n, r) => n + r.n, 0) };
}
