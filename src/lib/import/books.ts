import { and, eq, lt, or } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, transactions } from "@/db/schema";

/** What this account's books say it held at the START of `date` (its opening balance plus every entry dated earlier). */
export function booksBalanceBefore(db: DB, accountId: number, date: string): number {
  const opening = db.select({ o: accounts.openingBalance }).from(accounts).where(eq(accounts.id, accountId)).get()?.o ?? 0;
  const entries = db
    .select({ type: transactions.type, amount: transactions.amount, accountId: transactions.accountId, toAccountId: transactions.toAccountId })
    .from(transactions)
    .where(and(lt(transactions.date, date), or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId))))
    .all();
  let balance = opening;
  for (const t of entries) {
    if (t.type === "income") balance += t.amount;
    else if (t.type === "expense") balance -= t.amount;
    else {
      if (t.accountId === accountId) balance -= t.amount;
      if (t.toAccountId === accountId) balance += t.amount;
    }
  }
  return balance;
}
