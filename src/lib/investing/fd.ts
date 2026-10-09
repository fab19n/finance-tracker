/**
 * Fixed-deposit maths. Amounts are sen. Interest accrues daily on a 365-day year and stops at
 * maturity (after which the value stays at the maturity amount until you withdraw).
 */

export type Compounding = "simple" | "monthly" | "quarterly" | "annually";

export type FdTerms = {
  principal: number;
  annualRatePct: number;
  startDate: string; // YYYY-MM-DD
  maturityDate: string;
  compounding: Compounding;
};

const MS_DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / MS_DAY);
const PERIODS: Record<Exclude<Compounding, "simple">, number> = { monthly: 12, quarterly: 4, annually: 1 };

/** Value of the deposit (principal + accrued interest) on `date`. 0 before it is opened. */
export function fdValueOn(t: FdTerms, date: string): number {
  if (date < t.startDate) return 0;
  const end = date > t.maturityDate ? t.maturityDate : date;
  const years = Math.max(0, days(t.startDate, end)) / 365;
  const r = t.annualRatePct / 100;
  if (t.compounding === "simple") return Math.round(t.principal * (1 + r * years));
  const n = PERIODS[t.compounding];
  return Math.round(t.principal * Math.pow(1 + r / n, n * years));
}

export function fdMaturityValue(t: FdTerms): number {
  return fdValueOn(t, t.maturityDate);
}

/** Interest earned so far. */
export function fdAccruedInterest(t: FdTerms, date: string): number {
  return Math.max(0, fdValueOn(t, date) - t.principal);
}

/** Days until maturity (negative once matured). */
export function fdDaysToMaturity(t: FdTerms, today: string): number {
  return days(today, t.maturityDate);
}
