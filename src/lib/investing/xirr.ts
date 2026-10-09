export type CashFlow = {
  date: string; // YYYY-MM-DD
  /** sen. Negative = money you put in, positive = money you took out or the value today. */
  amount: number;
};

const MS_DAY = 86_400_000;

/**
 * XIRR: the single annual rate that makes the dated cash flows net to zero.
 * It is the honest "how fast did my money grow" figure because it accounts for WHEN you
 * added money, unlike a plain gain/cost percentage. Returns null when it can't be computed
 * (no money in, nothing out/valued, or everything on the same day).
 */
export function xirr(flows: CashFlow[]): number | null {
  const fs = flows.filter((f) => f.amount !== 0).sort((a, b) => a.date.localeCompare(b.date));
  if (fs.length < 2) return null;
  if (!fs.some((f) => f.amount < 0) || !fs.some((f) => f.amount > 0)) return null;
  const t0 = Date.parse(fs[0].date);
  const years = fs.map((f) => (Date.parse(f.date) - t0) / MS_DAY / 365);
  if (years[years.length - 1] <= 0) return null;

  const npv = (r: number) => fs.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, years[i]), 0);
  const dnpv = (r: number) => fs.reduce((s, f, i) => s - (years[i] * f.amount) / Math.pow(1 + r, years[i] + 1), 0);

  // Newton-Raphson from a sensible guess...
  let r = 0.1;
  for (let i = 0; i < 60; i++) {
    const f = npv(r);
    const d = dnpv(r);
    if (!Number.isFinite(f) || !Number.isFinite(d) || d === 0) break;
    const next = r - f / d;
    if (next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  // ...falling back to bisection, which can't diverge.
  let lo = -0.9999;
  let hi = 100;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-6) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}
