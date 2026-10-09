/**
 * Compound-growth maths for the "what if" projections. Amounts are sen; rates are % per year.
 * Contributions are made at the END of each month and growth compounds monthly.
 */

/** Value after `years` of putting `monthly` away every month. */
export function futureValueMonthly(monthly: number, ratePct: number, years: number): number {
  const n = Math.round(years * 12);
  if (n <= 0 || monthly <= 0) return 0;
  const r = ratePct / 100 / 12;
  if (r === 0) return Math.round(monthly * n);
  return Math.round(monthly * ((Math.pow(1 + r, n) - 1) / r));
}

/** Value after `years` of a one-off amount left to grow. */
export function futureValueLump(lump: number, ratePct: number, years: number): number {
  if (lump <= 0 || years <= 0) return Math.max(0, Math.round(lump));
  return Math.round(lump * Math.pow(1 + ratePct / 100 / 12, years * 12));
}

export type GrowthPoint = { year: number; value: number; contributed: number };

/** Year-by-year growth of a starting lump plus a monthly contribution (year 0 = today). */
export function projectGrowth(opts: { lump: number; monthly: number; ratePct: number; years: number }): GrowthPoint[] {
  const { lump, monthly, ratePct, years } = opts;
  const out: GrowthPoint[] = [];
  for (let y = 0; y <= years; y++) {
    out.push({
      year: y,
      value: futureValueLump(lump, ratePct, y) + futureValueMonthly(monthly, ratePct, y),
      contributed: lump + monthly * 12 * y,
    });
  }
  return out;
}
