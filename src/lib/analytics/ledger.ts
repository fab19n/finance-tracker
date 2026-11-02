import { daysBetween, shiftDays } from "@/lib/dates";

/**
 * One account's running balance, from its entries. Pure: no database, no clock (the caller says what "today" is by choosing
 * the end of the range). The balance is the same sum `getAccountBalances` makes, so a chart or a statement built from this
 * ends on exactly the figure shown on the account's chip.
 */

export type LedgerEntry = {
  id: number;
  date: string; // YYYY-MM-DD
  type: "income" | "expense" | "transfer";
  amount: number; // sen, positive
  accountId: number;
  toAccountId: number | null;
};

/** Does this entry touch the account at all (as the account it is on, or the one a transfer reached)? */
export const touches = (e: LedgerEntry, accountId: number) => e.accountId === accountId || e.toAccountId === accountId;

/**
 * What an entry does to ONE account's balance, in sen: income in is +, spending is -, and a transfer is - on the account it
 * left and + on the one it reached. 0 for an entry that doesn't touch the account.
 */
export function balanceDelta(e: LedgerEntry, accountId: number): number {
  if (e.type === "income") return e.accountId === accountId ? e.amount : 0;
  if (e.type === "expense") return e.accountId === accountId ? -e.amount : 0;
  return (e.toAccountId === accountId ? e.amount : 0) - (e.accountId === accountId ? e.amount : 0);
}

export type LedgerLine = {
  id: number;
  date: string;
  /** What this entry did to the balance (signed sen). */
  delta: number;
  /** The balance right after it. */
  balance: number;
};

/**
 * Every entry that touches the account, oldest first (the id breaks ties within a day, as the lists do), each with the
 * balance after it. `opening` is the account's opening balance.
 */
export function accountLedger(opening: number, entries: LedgerEntry[], accountId: number): LedgerLine[] {
  let balance = opening;
  return entries
    .filter((e) => touches(e, accountId))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))
    .map((e) => {
      const delta = balanceDelta(e, accountId);
      balance += delta;
      return { id: e.id, date: e.date, delta, balance };
    });
}

/** The balance at the end of `date` (every entry dated that day or earlier counts); `opening` when nothing has happened yet. */
export function balanceAtEndOf(opening: number, lines: LedgerLine[], date: string): number {
  let balance = opening;
  for (const l of lines) {
    if (l.date > date) break;
    balance = l.balance;
  }
  return balance;
}

export type BalancePoint = { date: string; balance: number };

export type BalanceHistory = {
  from: string;
  to: string;
  /** The balance just before the period began (the end of the day before `from`). */
  start: number;
  /** The balance at the end of the period. */
  end: number;
  change: number;
  /** The end-of-day extremes over the period, `null` when nothing moved the balance in it. */
  low: BalancePoint | null;
  high: BalancePoint | null;
  /** End-of-day balances, at most `maxPoints` of them, the last one always on `to`. */
  points: BalancePoint[];
};

/**
 * How the balance moved between two dates. `from` may be null (from the beginning: the first entry, or `to` when there is
 * none); a `from` after `to` is pulled back to `to`. A long period is sampled every few days, so a chart never has more than
 * `maxPoints` dots, but `low` and `high` are found from every day with activity, not from the sample.
 */
export function balanceHistory(
  opening: number,
  entries: LedgerEntry[],
  accountId: number,
  range: { from: string | null; to: string },
  maxPoints = 60,
): BalanceHistory {
  const lines = accountLedger(opening, entries, accountId);
  const to = range.to;
  let from = range.from ?? lines[0]?.date ?? to;
  if (from > to) from = to;

  const start = balanceAtEndOf(opening, lines, shiftDays(from, -1));

  // Walk the days once, noting the end-of-day balance of every day with activity and filling the sampled dates.
  const step = Math.max(1, Math.ceil(daysBetween(from, to) / Math.max(1, maxPoints - 1)));
  const sampleDates: string[] = [];
  for (let d = from; d < to; d = shiftDays(d, step)) sampleDates.push(d);
  sampleDates.push(to);

  const points: BalancePoint[] = [];
  let i = 0;
  let running = start;
  for (const d of sampleDates) {
    while (i < lines.length && lines[i].date <= d) running = lines[i++].balance;
    points.push({ date: d, balance: running });
  }

  let low: BalancePoint | null = null;
  let high: BalancePoint | null = null;
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    if (l.date < from || l.date > to) continue;
    // The end of a day is its last line (lines are in date order, so the next line is on another day or there is none).
    if (lines[k + 1]?.date === l.date) continue;
    if (!low || l.balance < low.balance) low = { date: l.date, balance: l.balance };
    if (!high || l.balance > high.balance) high = { date: l.date, balance: l.balance };
  }

  const end = points[points.length - 1].balance;
  return { from, to, start, end, change: end - start, low, high, points };
}
