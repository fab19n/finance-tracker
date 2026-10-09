import { daysBetween, daysInMonth, shiftDays, shiftMonth } from "@/lib/dates";

/**
 * Pay cycles. Your "month" runs payday to payday, and payday can land anywhere from the 26th to the 31st,
 * so calendar months blur the picture. Everything here is pure: dates in, dates out.
 *
 *   cycle = [ the day salary arrived , the day before the next salary is expected ]
 */

export type Cycle = {
  /** First day of the cycle: the day salary arrived. */
  start: string;
  /** Last day: the day before the next payday. */
  end: string;
  /** When the next salary is expected. */
  nextPayday: string;
  /** Whole days from today until the next payday (0 on payday or if it is overdue). */
  daysLeft: number;
  /** Length of the cycle in days. */
  daysTotal: number;
  /** Which day of the cycle today is (1-based). */
  dayNumber: number;
  /** 'salary' = worked out from salary you recorded; 'setting' = from the payday day set in Settings. */
  source: "salary" | "setting";
  /** The expected payday has arrived but no salary has been recorded yet. */
  paydayOverdue: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (iso: string) => Number(iso.slice(8, 10));

/** The given day-of-month in `month`, clamped to the month's length (31 -> 28 in February). */
export function clampDay(month: string, day: number): string {
  return `${month}-${pad(Math.min(Math.max(day, 1), daysInMonth(month)))}`;
}

/**
 * Clean up recorded salary dates: sorted, unique, and anything within 10 days of the previous one dropped
 * (a bonus or correction logged as "Salary" must not split a cycle in two).
 */
export function normalizeSalaryDates(dates: string[]): string[] {
  const out: string[] = [];
  for (const d of [...new Set(dates)].sort()) {
    if (out.length && daysBetween(out[out.length - 1], d) < 10) continue;
    out.push(d);
  }
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Predict the next payday from the last few: the usual day-of-month, in the month after the latest one. */
export function predictNextPayday(salaryDates: string[], fallbackDay: number): string {
  const last = salaryDates[salaryDates.length - 1];
  const recent = salaryDates.slice(-3).map(dayOf);
  const day = recent.length ? median(recent) : fallbackDay;
  return clampDay(shiftMonth(last.slice(0, 7), 1), day);
}

export function currentCycle(opts: { today: string; salaryDates: string[]; paydayDay: number }): Cycle {
  const { today, paydayDay } = opts;
  const salary = normalizeSalaryDates(opts.salaryDates).filter((d) => d <= today);
  const last = salary[salary.length - 1];

  let start: string;
  let next: string;
  let source: Cycle["source"];
  if (last && daysBetween(last, today) <= 45) {
    start = last;
    next = predictNextPayday(salary, paydayDay);
    source = "salary";
  } else {
    // No (recent) salary recorded: fall back to the payday day from Settings.
    const month = today.slice(0, 7);
    const thisMonth = clampDay(month, paydayDay);
    start = thisMonth <= today ? thisMonth : clampDay(shiftMonth(month, -1), paydayDay);
    next = clampDay(shiftMonth(start.slice(0, 7), 1), paydayDay);
    source = "setting";
  }

  return {
    start,
    end: shiftDays(next, -1),
    nextPayday: next,
    daysLeft: Math.max(0, daysBetween(today, next)),
    daysTotal: Math.max(1, daysBetween(start, next)),
    dayNumber: Math.max(1, daysBetween(start, today) + 1),
    source,
    paydayOverdue: source === "salary" && next <= today,
  };
}

export type CycleRange = { start: string; end: string; complete: boolean };

/**
 * The most recent cycles, newest first, built from consecutive salary dates. The newest is the one in
 * progress (`complete: false`). Needs at least one recorded salary.
 */
export function cycleHistory(opts: { today: string; salaryDates: string[]; paydayDay: number; max?: number }): CycleRange[] {
  const salary = normalizeSalaryDates(opts.salaryDates).filter((d) => d <= opts.today);
  if (!salary.length) return [];
  const current = currentCycle(opts);
  const out: CycleRange[] = [];
  // The one in progress (even when the last salary is stale, so it always matches currentCycle()).
  out.push({ start: current.start, end: current.end < opts.today ? opts.today : current.end, complete: false });
  for (let i = salary.length - 1; i >= 0 && out.length < (opts.max ?? 6); i--) {
    const start = salary[i];
    if (start >= current.start) continue;
    const nextStart = i + 1 < salary.length ? salary[i + 1] : current.start;
    out.push({ start, end: shiftDays(nextStart, -1), complete: true });
  }
  return out;
}

/** "28 Sep - 27 Oct" */
export function cycleLabel(c: { start: string; end: string }): string {
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-").map(Number);
    return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
  };
  return `${fmt(c.start)} - ${fmt(c.end)}`;
}
