import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";

/**
 * Dates are local calendar days as 'YYYY-MM-DD'. Months are 'YYYY-MM'.
 * Anything that reads the clock (todayISO) must run at request time:
 * call `await connection()` (done by getDb()) before using it in a Server Component.
 */

export const toISO = (d: Date) => format(d, "yyyy-MM-dd");
export const fromISO = (s: string) => parseISO(s);

export function todayISO(): string {
  return toISO(new Date());
}

export function currentMonth(): string {
  return format(new Date(), "yyyy-MM");
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  return toISO(endOfMonth(parseISO(`${month}-01`)));
}

export function shiftMonth(month: string, delta: number): string {
  return format(addMonths(startOfMonth(parseISO(`${month}-01`)), delta), "yyyy-MM");
}

export function shiftDays(iso: string, delta: number): string {
  return toISO(addDays(parseISO(iso), delta));
}

export function daysInMonth(month: string): number {
  return endOfMonth(parseISO(`${month}-01`)).getDate();
}

export function monthLabel(month: string): string {
  return format(parseISO(`${month}-01`), "MMMM yyyy");
}

export function shortMonthLabel(month: string): string {
  return format(parseISO(`${month}-01`), "MMM yy");
}

export function dayLabel(iso: string): string {
  return format(parseISO(iso), "EEE, d MMM");
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

/** Last n months ending at (and including) `month`, oldest first. */
export function lastMonths(month: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(month, i - (n - 1)));
}

export const isMonth = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}$/.test(s);
export const isISODate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** "9 Oct" */
export function shortDate(iso: string): string {
  return format(parseISO(iso), "d MMM");
}
