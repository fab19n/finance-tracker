import { daysBetween, shiftDays, shiftMonth } from "@/lib/dates";
import { clampDay, currentCycle, normalizeSalaryDates } from "@/lib/plan/cycle";
import { daysInMonthOf, type FlowRow } from "./summary";

/**
 * Pay-cycle "months". Your money moves payday to payday: the salary that lands on 26 Sep is what you live on until 25 Oct,
 * so 1-10 Oct holds rent, insurance and subscriptions but no pay, and looks overspent. The Dashboard's analytics are all
 * keyed on a calendar month ("YYYY-MM") and a day of that month, so the cycle view re-files every entry under the month
 * its cycle is NAMED after, with the day counted from payday. The analytics then run unchanged.
 */

export type Period = {
  /** 'YYYY-MM': the month the cycle is named after (the one most of its days fall in: 26 Sep - 25 Oct is October). */
  key: string;
  /** First and last day, inclusive. */
  start: string;
  end: string;
  /** The cycle in progress. */
  current: boolean;
};

const dayOf = (iso: string) => Number(iso.slice(8, 10));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** The month a cycle is named after: the one its middle day falls in. 26 Sep - 25 Oct is October; 1 Oct - 31 Oct is October. */
export function periodKey(start: string, end: string): string {
  return shiftDays(start, Math.floor(daysBetween(start, end) / 2)).slice(0, 7);
}

/**
 * The pay cycles, newest first: the one in progress (exactly the Plan page's), then the earlier ones. A past cycle runs
 * from one recorded salary to the day before the next. Before your first recorded salary there is nothing to read the
 * payday from, so cycles are cut at the day you are usually paid (the middle of your last three recorded paydays),
 * and only with no salary at all at the payday set in Settings.
 */
export function payCyclePeriods(opts: { today: string; salaryDates: string[]; paydayDay: number; count?: number }): Period[] {
  const count = Math.max(1, opts.count ?? 24);
  const cur = currentCycle(opts);
  const recorded = normalizeSalaryDates(opts.salaryDates).filter((d) => d <= opts.today);
  const usualDay = recorded.length ? median(recorded.slice(-3).map(dayOf)) : opts.paydayDay;

  // Where each cycle starts, newest first.
  const starts: string[] = [cur.start];
  for (let i = recorded.length - 1; i >= 0 && starts.length < count; i--) if (recorded[i] < cur.start) starts.push(recorded[i]);
  while (starts.length < count) starts.push(clampDay(shiftMonth(starts[starts.length - 1].slice(0, 7), -1), usualDay));

  // The cycle in progress runs to today if its next payday has passed without a salary being recorded.
  const periods: Period[] = starts.map((start, i) => ({
    key: "",
    start,
    end: i === 0 ? (cur.end < opts.today ? opts.today : cur.end) : shiftDays(starts[i - 1], -1),
    current: i === 0,
  }));
  // One cycle a month: name them in a row from the newest, so each month appears exactly once.
  const newest = periodKey(periods[0].start, periods[0].end);
  periods.forEach((p, i) => (p.key = shiftMonth(newest, -i)));
  return periods;
}

/**
 * File every entry under its cycle's month, with the day counted from payday (day 1 = the day the salary landed), capped
 * at the length of that month. Entries outside every cycle are left out.
 */
export function rekeyRows(rows: FlowRow[], periods: Period[]): FlowRow[] {
  const out: FlowRow[] = [];
  for (const r of rows) {
    const p = periods.find((x) => r.date >= x.start && r.date <= x.end);
    if (!p) continue;
    const day = Math.min(daysBetween(p.start, r.date) + 1, daysInMonthOf(p.key));
    out.push({ ...r, date: `${p.key}-${String(day).padStart(2, "0")}` });
  }
  return out;
}

/** How far through a cycle you are: the day number so far for the cycle in progress, its whole length for a finished one. */
export function periodDay(p: Period, today: string): number {
  return Math.min(daysBetween(p.start, p.current ? today : p.end) + 1, daysInMonthOf(p.key));
}
