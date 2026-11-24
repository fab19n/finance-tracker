import { paycheckIn } from "@/lib/analytics/summary";
import { formatRM, formatRMWhole } from "@/lib/money";

export type FlowBarMode = "hidden" | "bar" | "no-pay";

/**
 * What Activity's "Spent against income" shows. Pure.
 * - Hidden when the list is narrowed (one account, a category, a search, an amount range or a type): the figures are then a
 *   slice, and pay does not land in every slice, so "no income" or a full bar would be false (the Dashboard hides its
 *   "income used" bar for one account for the same reason).
 * - A plain "no pay recorded" line when the income is below a paycheck (a few sen of interest is not pay), never a percentage.
 */
export function flowBarMode(o: { narrowed: boolean; income: number; spent: number; expectedIncome: number }): FlowBarMode {
  if (o.narrowed) return "hidden";
  if (o.income <= 0 && o.spent <= 0) return "hidden";
  if (!paycheckIn(o.income, o.expectedIncome)) return o.spent > 0 ? "no-pay" : "hidden";
  return "bar";
}

/**
 * Income against spending as one pill: the filled part is the share of the income that went out. Past 100% the pill is
 * full and turns danger. Pure presentation; both sides are in the text too (colour is never the only signal).
 */
export function FlowBar({ income, spent, expectedIncome, narrowed, flat = false }: { income: number; spent: number; expectedIncome: number; narrowed: boolean; /** Inside the list sheet: a raised block, not a card of its own. */ flat?: boolean }) {
  const mode = flowBarMode({ narrowed, income, spent, expectedIncome });
  if (mode === "hidden") return null;
  const frame = flat ? "rounded-2xl bg-card-subtle px-3 py-2.5" : "card";
  if (mode === "no-pay") {
    return (
      <section className={frame} aria-label="Income against spending">
        <p className="text-sm font-extrabold">
          <span className="num">{formatRM(spent)}</span> spent, no pay recorded in this period
        </p>
      </section>
    );
  }
  const over = spent > income;
  const pct = Math.min(100, Math.round((spent / income) * 100));
  return (
    <section className={frame} aria-label="Income against spending">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label">Spent against income</p>
        <p className={`text-xs font-extrabold ${over ? "text-danger" : "text-muted"}`}>{Math.round((spent / income) * 100)}% used</p>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-background" role="img" aria-label={`${formatRMWhole(spent)} spent of ${formatRMWhole(income)} income`}>
        <div className={`h-3 rounded-full ${over ? "bg-danger" : "bg-accent-strong"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="num mt-2 flex justify-between text-xs font-extrabold">
        <span>{formatRMWhole(spent)} spent</span>
        <span className="text-good">{formatRMWhole(income)} in</span>
      </div>
    </section>
  );
}
