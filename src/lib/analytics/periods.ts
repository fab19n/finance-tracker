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

/** What "a month" means on Home and Insights: payday to payday, or a calendar month. */
export type PeriodView = "cycle" | "month";

export type PeriodChoice = {
  view: PeriodView;
  /** The pay cycles (newest first) in cycle view; null in calendar view. */
  periods: Period[] | null;
  /** The cycle on screen; null in calendar view. */
  period: Period | null;
  /** 'YYYY-MM': the period on screen (a cycle is named after its month). */
  month: string;
  prev: string;
  /** The newest and oldest period you can go to (`oldestMonth` is undefined in calendar view). */
  nowMonth: string;
  oldestMonth: string | undefined;
  /** The period on screen is the one in progress. */
  isCurrent: boolean;
  unit: "cycle" | "month";
  /** First and last day of the period on screen, inclusive. */
  start: string;
  end: string;
  /** Its length in days. */
  total: number;
  /** The day number reached (so far for the one in progress, the whole length for a finished one): the "day" the analytics take. */
  dayNow: number;
  /** Days of the real calendar that have passed in it, for a budget's pace (a cycle named after a 30-day month can run 31 days). */
  elapsed: number;
};

/**
 * Which period are we looking at? ONE answer for Home and Insights, so a budget cannot be "over" on one and fine on the other.
 * The view is the one asked for (`view=cycle|month`), else a pay cycle when a salary was recorded recently (the Plan's own
 * test: `currentCycle().source === "salary"`), else the calendar month. `month` is `?month=`; anything outside the periods
 * on offer falls back to the newest.
 */
export function resolvePeriod(opts: {
  today: string;
  salaryDates: string[];
  paydayDay: number;
  view?: string;
  month?: string;
}): PeriodChoice {
  const { today } = opts;
  const cycleNow = currentCycle({ today, salaryDates: opts.salaryDates, paydayDay: opts.paydayDay });
  const view: PeriodView = opts.view === "cycle" || opts.view === "month" ? opts.view : cycleNow.source === "salary" ? "cycle" : "month";
  const periods = view === "cycle" ? payCyclePeriods({ today, salaryDates: opts.salaryDates, paydayDay: opts.paydayDay }) : null;
  const nowMonth = periods ? periods[0].key : today.slice(0, 7);
  const oldestMonth = periods ? periods[periods.length - 1].key : undefined;
  const asked = opts.month;
  const isMonthKey = !!asked && /^\d{4}-\d{2}$/.test(asked);
  const month = isMonthKey && asked! <= nowMonth && (oldestMonth === undefined || asked! >= oldestMonth) ? asked! : nowMonth;
  const period = periods?.find((p) => p.key === month) ?? null;
  const isCurrent = month === nowMonth;
  const start = period ? period.start : `${month}-01`;
  const end = period ? period.end : `${month}-${String(daysInMonthOf(month)).padStart(2, "0")}`;
  const total = daysBetween(start, end) + 1;
  const dayNow = period ? periodDay(period, today) : isCurrent ? Number(today.slice(8, 10)) : daysInMonthOf(month);
  const elapsed = period ? (isCurrent ? daysBetween(period.start, today) + 1 : total) : dayNow;
  return { view, periods, period, month, prev: shiftMonth(month, -1), nowMonth, oldestMonth, isCurrent, unit: period ? "cycle" : "month", start, end, total, dayNow, elapsed };
}
