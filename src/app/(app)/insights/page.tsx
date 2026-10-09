import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, HandCoins, Info, PiggyBank } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { reconcileCashAction } from "@/app/actions/cash";
import { detectLeaks, headlineSavings, type Insight, type Severity } from "@/lib/analytics/leakage";
import { detectRecurring } from "@/lib/analytics/recurring";
import { daysBetween, shiftDays, todayISO } from "@/lib/dates";
import { formatRM, formatRMWhole } from "@/lib/money";
import { listFlowRows } from "@/lib/queries/analytics";
import { getCashStatus } from "@/lib/queries/cash";
import type { SearchParams } from "@/lib/queries/filters";
import { listCategories } from "@/lib/queries/reference";
import { getSettings } from "@/lib/settings";

const SEVERITY: Record<Severity, { label: string; icon: typeof Info; pill: string }> = {
  high: { label: "High impact", icon: AlertTriangle, pill: "bg-danger-soft text-danger" },
  medium: { label: "Worth a look", icon: AlertCircle, pill: "bg-warn-soft text-warn" },
  low: { label: "Good to know", icon: Info, pill: "bg-background text-muted" },
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function InsightCard({ i, years, rate }: { i: Insight; years: number; rate: number }) {
  const sev = SEVERITY[i.severity];
  const Icon = sev.icon;
  return (
    <article className="card space-y-3" aria-labelledby={`h-${i.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`pill gap-1 ${sev.pill}`}>
          <Icon size={12} aria-hidden /> {sev.label}
        </span>
      </div>
      <h3 id={`h-${i.id}`} className="text-base font-semibold leading-snug">
        {i.title}
      </h3>
      <ul className="space-y-1 text-sm text-muted">
        {i.evidence.map((e) => (
          <li key={e} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
            <span>{e}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm">{i.suggestion}</p>
      {i.annualSaving > 0 && (
        <div className="rounded-xl bg-accent-soft px-3 py-2.5 text-sm text-accent">
          <p className="font-semibold">
            Could save ≈ {formatRM(i.monthlySaving)}/month · {formatRM(i.annualSaving)}/year
          </p>
          <p className="text-xs opacity-90">
            Invested for {years} years at an assumed {rate}% that grows to roughly {formatRMWhole(i.investedValue)}.
          </p>
        </div>
      )}
      {i.href && (
        <Link href={i.href} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
          See the entries <ArrowRight size={14} />
        </Link>
      )}
    </article>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const today = todayISO();
  const [rows, categories, settings, cash] = await Promise.all([
    listFlowRows(shiftDays(today, -150), today),
    listCategories(),
    getSettings(),
    getCashStatus(todayISO()),
  ]);

  const insights = detectLeaks({
    rows,
    today,
    categories: categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, monthlyBudget: c.monthlyBudget })),
    assumptions: { sp500ReturnPct: settings.sp500ReturnPct, horizonYears: settings.horizonYears },
    cash: { unaccounted90: cash.unaccounted90, withdrawn90: cash.withdrawn90 },
  });
  const headline = headlineSavings(insights);
  const recurring = detectRecurring(rows, today).filter((r) => r.active);
  const recurringMonthly = recurring.reduce((s, r) => s + r.monthlyCost, 0);

  const since30 = shiftDays(today, -29);
  const loggedDays = new Set(rows.filter((r) => r.date >= since30).map((r) => r.date)).size;
  const dataSpanDays = rows.length ? daysBetween(rows[0].date, today) + 1 : 0;
  const trackedWindow = Math.min(30, Math.max(dataSpanDays, 1));

  const recon = first(sp.recon);
  const reconAmt = Number(first(sp.amt) ?? 0);
  const daysSinceRecon = cash.lastReconciled ? daysBetween(cash.lastReconciled, today) : null;
  const needsCount = cash.accounts.length > 0 && (daysSinceRecon === null || daysSinceRecon > 14);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="h-page">Insights</h1>
        <p className="text-sm text-muted">Where your money leaks, found from your own entries. Estimates, not verdicts.</p>
      </div>

      {insights.length > 0 ? (
        <section className="card border-accent/40 bg-accent-soft/40" aria-label="Summary">
          <p className="flex items-center gap-2 text-sm font-medium text-accent">
            <PiggyBank size={18} aria-hidden /> The top {Math.min(3, insights.length)} findings
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">≈ {formatRMWhole(headline.annual)} a year</p>
          <p className="mt-1 text-sm text-muted">
            is at stake ({formatRMWhole(headline.monthly)}/month). Invested for {settings.horizonYears} years at an assumed{" "}
            {settings.sp500ReturnPct}%, that could become roughly <strong>{formatRMWhole(headline.invested)}</strong>. Some findings
            overlap (a latte also sits inside Eating Out), so treat this as a ceiling.
          </p>
        </section>
      ) : (
        <section className="card text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={18} className="text-accent" aria-hidden /> No leaks found yet
          </p>
          <p className="mt-1 text-muted">
            {rows.length < 40
              ? "Keep logging - patterns need a few weeks of entries, and trends need at least two months."
              : "Nothing stands out against your own history right now. Nice."}
          </p>
        </section>
      )}

      <section id="cash" className="card space-y-3 scroll-mt-20" aria-labelledby="cash-h">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <HandCoins size={20} aria-hidden />
          </span>
          <div>
            <h2 id="cash-h" className="font-semibold">
              Count your cash
            </h2>
            <p className="text-sm text-muted">
              Cash is where &quot;every penny&quot; usually breaks. Count what&apos;s in your wallet and the gap becomes a
              logged &quot;Unaccounted cash&quot; expense - so the leak is visible.
            </p>
          </div>
        </div>

        {recon === "shortfall" && (
          <p role="status" className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-medium text-warn">
            Cash was {formatRM(reconAmt)} short of the books. Booked as Unaccounted cash.
          </p>
        )}
        {recon === "surplus" && (
          <p role="status" className="rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
            You had {formatRM(reconAmt)} more cash than the books said. Booked as a cash adjustment.
          </p>
        )}
        {recon === "match" && (
          <p role="status" className="rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
            Spot on - your books match your wallet.
          </p>
        )}
        {recon === "invalid" && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            Enter the amount you counted, e.g. 85.50.
          </p>
        )}

        {cash.accounts.length === 0 ? (
          <p className="text-sm text-muted">Add a &quot;Cash in hand&quot; account in Settings to use this.</p>
        ) : (
          <form action={reconcileCashAction} className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className="label" htmlFor="cash-account">
                Account
              </label>
              <select id="cash-account" name="accountId" className="input">
                {cash.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (books: {formatRM(a.ledgerBalance)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="actual">
                Actually counted (RM)
              </label>
              <input id="actual" name="actual" inputMode="decimal" placeholder="0.00" required className="input" />
            </div>
            <button className="btn-primary self-end !py-2.5 text-sm">Reconcile</button>
          </form>
        )}
        <p className={`text-xs ${needsCount ? "font-medium text-warn" : "text-muted"}`}>
          {daysSinceRecon === null
            ? "You haven't counted your cash yet - try it now."
            : daysSinceRecon === 0
              ? "Counted today."
              : `Last counted ${daysSinceRecon} day${daysSinceRecon === 1 ? "" : "s"} ago${needsCount ? " - time for another count." : "."}`}
        </p>
      </section>

      {insights.length > 0 && (
        <section className="space-y-3" aria-label="Findings">
          <h2 className="text-lg font-semibold">What we found</h2>
          {insights.map((i) => (
            <InsightCard key={i.id} i={i} years={settings.horizonYears} rate={settings.sp500ReturnPct} />
          ))}
        </section>
      )}

      <section className="card" aria-labelledby="habit">
        <h2 id="habit" className="font-semibold">
          Logging habit
        </h2>
        <p className="mt-1 text-sm">
          You logged something on <strong>{loggedDays}</strong> of the last {trackedWindow} days.
        </p>
        <p className="text-xs text-muted">
          {loggedDays >= trackedWindow * 0.8
            ? "Great consistency - this is what makes the insights trustworthy."
            : "Gaps usually mean forgotten spending. Logging right after you pay is the habit that matters most."}
        </p>
      </section>

      {recurring.length > 0 && (
        <section className="card" aria-labelledby="recurring">
          <details>
            <summary className="flex cursor-pointer items-baseline justify-between gap-3">
              <h2 id="recurring" className="font-semibold">
                Regular payments we spotted ({recurring.length})
              </h2>
              <span className="num text-sm text-muted">{formatRM(recurringMonthly)}/month</span>
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1.5 font-medium">Payment</th>
                    <th className="py-1.5 font-medium">Every</th>
                    <th className="py-1.5 text-right font-medium">Amount</th>
                    <th className="py-1.5 text-right font-medium">Per year</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recurring.map((r) => (
                    <tr key={r.item}>
                      <td className="py-2">
                        {r.item} <span className="text-xs text-muted">{r.category}</span>
                      </td>
                      <td className="py-2 text-muted">{r.cadence === "monthly" ? "month" : r.cadence === "weekly" ? "week" : "year"}</td>
                      <td className="num py-2 text-right">{formatRM(r.amount)}</td>
                      <td className="num py-2 text-right font-semibold">{formatRM(r.annualCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
