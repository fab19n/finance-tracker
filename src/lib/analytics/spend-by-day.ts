/**
 * Spending day by day for the period on screen and the one before it, with the running totals: what Home's phone chart
 * draws. Pure (rows in, numbers out; no database, no clock) and unit-tested. It counts ALL spending, as the total above
 * the chart does, so the days add up to that total; the daily calendar's limit and left-out categories play no part.
 *
 * It takes entries with their REAL dates. The desktop chart (`cumulativeSpend`) works from days re-filed under a month,
 * which folds a pay cycle's 31st day into its 30th. That is fine for a running total, but not for one day's amount.
 */
import { shiftDays } from "@/lib/dates";
import type { FlowRow } from "./summary";

type Span = { start: string; end: string };

export type SpendPoint = {
  /** 1 = the first day of its period. */
  day: number;
  /** The period on screen: this day's date (null past its end), what was spent on it and the running total to it. The two
      amounts are null on a day not reached yet. */
  date: string | null;
  spent: number | null;
  total: number | null;
  /** The period before, same day number. All null past its end, or when there is no period before. */
  prevDate: string | null;
  prevSpent: number | null;
  prevTotal: number | null;
};

export function spendByDay(rows: FlowRow[], current: Span, previous: Span | null, today: string): SpendPoint[] {
  const perDay = new Map<string, number>();
  for (const r of rows) {
    if (r.type === "expense") perDay.set(r.date, (perDay.get(r.date) ?? 0) + r.amount);
  }

  const datesOf = (span: Span) => {
    const dates: string[] = [];
    for (let d = span.start; d <= span.end; d = shiftDays(d, 1)) dates.push(d);
    return dates;
  };
  const now = datesOf(current);
  const before = previous ? datesOf(previous) : [];

  // This period has got as far as today, or further if something is already entered for a later day of it: the total above
  // counts that too, so the days have to.
  const reached = now.reduce((last, d) => (perDay.has(d) && d > last ? d : last), today < current.end ? today : current.end);

  let total = 0;
  let prevTotal = 0;
  return Array.from({ length: Math.max(now.length, before.length) }, (_, i) => {
    const date = now[i] ?? null;
    const prevDate = before[i] ?? null;
    const spent = date !== null && date <= reached ? (perDay.get(date) ?? 0) : null;
    const prevSpent = prevDate !== null ? (perDay.get(prevDate) ?? 0) : null;
    if (spent !== null) total += spent;
    if (prevSpent !== null) prevTotal += prevSpent;
    return { day: i + 1, date, spent, total: spent === null ? null : total, prevDate, prevSpent, prevTotal: prevSpent === null ? null : prevTotal };
  });
}
