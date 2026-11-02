import { eq, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accounts, transactions } from "@/db/schema";
import type { LedgerEntry } from "@/lib/analytics/ledger";

/**
 * Everything one account's balance is made of: its opening balance and every entry on either side of it (a transfer shows
 * on both accounts). Feed it to `accountLedger` / `balanceHistory`. Archived accounts work too.
 */
export async function getAccountLedger(accountId: number): Promise<{ opening: number; entries: LedgerEntry[] }> {
  const db = await getDb();
  const account = db.select({ opening: accounts.openingBalance }).from(accounts).where(eq(accounts.id, accountId)).get();
  const entries = db
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      amount: transactions.amount,
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
    })
    .from(transactions)
    .where(or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId)))
    .all();
  return { opening: account?.opening ?? 0, entries };
}
