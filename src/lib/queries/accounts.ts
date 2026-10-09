import { eq, sql } from "drizzle-orm";
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
