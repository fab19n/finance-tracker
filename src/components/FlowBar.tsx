import { formatRMWhole } from "@/lib/money";

/**
 * Income against spending as one pill: the filled part is the share of the income that went out. Past 100% the pill is
 * full and turns danger. Pure presentation; both sides are in the text too (colour is never the only signal).
 */
export function FlowBar({ income, spent }: { income: number; spent: number }) {
  if (income <= 0 && spent <= 0) return null;
  const over = income > 0 && spent > income;
  const pct = income > 0 ? Math.min(100, Math.round((spent / income) * 100)) : 100;
  return (
    <section className="card" aria-label="Income against spending">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label">Spent against income</p>
        <p className={`text-xs font-extrabold ${over ? "text-danger" : "text-muted"}`}>{income > 0 ? `${Math.round((spent / income) * 100)}% used` : "no income"}</p>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-card-subtle" role="img" aria-label={`${formatRMWhole(spent)} spent of ${formatRMWhole(income)} income`}>
        <div className={`h-3 rounded-full ${over ? "bg-danger" : "bg-accent-strong"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="num mt-2 flex justify-between text-xs font-extrabold">
        <span>{formatRMWhole(spent)} spent</span>
        <span className="text-good">{formatRMWhole(income)} in</span>
      </div>
    </section>
  );
}
