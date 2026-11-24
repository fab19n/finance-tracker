import { accountLedger, type LedgerEntry } from "@/lib/analytics/ledger";

/** How many of an account's movements its page lists: a first screenful, then View more adds a step, up to a cap. */
export const FIRST = 6;
export const STEP = 12;
export const CAP = 120;

/** `?show=` is forgiving: junk means the first page, never below it, never above the cap. */
export function movementsShown(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > FIRST ? Math.min(n, CAP) : FIRST;
}

/**
 * The balance right AFTER each of an account's entries, by entry id, from the same ledger the balance chart and the
 * statement use (`accountLedger`), so the newest line's figure is exactly the account's balance. An entry that does not
 * touch the account has no figure.
 */
export function balanceAfterById(opening: number, entries: LedgerEntry[], accountId: number): Map<number, number> {
  return new Map(accountLedger(opening, entries, accountId).map((l) => [l.id, l.balance]));
}

/** What the net-worth pill says about the last stretch: income minus spending, in sen (transfers are neither). */
export function recentChange(t: { income: number; expense: number; count: number }): number | null {
  return t.count > 0 ? t.income - t.expense : null;
}
