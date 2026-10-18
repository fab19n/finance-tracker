import { AlertCircle, AlertTriangle, ArrowRight, Check, CheckCircle2, Info } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { reconcileCashAction } from "@/app/actions/cash";
import { MoreHeader } from "@/components/MoreHeader";
import { detectLeaks, headlineSavings, type Insight, type Severity } from "@/lib/analytics/leakage";
import { detectRecurring, type Recurring } from "@/lib/analytics/recurring";
import { daysBetween, shiftDays, shortDate, todayISO } from "@/lib/dates";
import { formatRM, formatRMWhole } from "@/lib/money";
import { descriptionMatchesBill } from "@/lib/plan/bills";
import { listFlowRows } from "@/lib/queries/analytics";
import { getCashStatus } from "@/lib/queries/cash";
import type { SearchParams } from "@/lib/queries/filters";
import { getPlan } from "@/lib/queries/plan";
import { listCategories } from "@/lib/queries/reference";
import { getSettings } from "@/lib/settings";

// Severity is a word AND an icon AND a colour. "Good to know" is information, not good news, so it stays neutral.
const SEVERITY: Record<Severity, { label: string; icon: typeof Info; pill: string }> = {
  high: { label: "Heads up", icon: AlertTriangle, pill: "bg-danger-soft text-danger" },
  medium: { label: "Worth a look", icon: AlertCircle, pill: "bg-warn-soft text-warn" },
  low: { label: "Good to know", icon: Info, pill: "bg-card-subtle text-muted" },
};

const CADENCE: Record<Recurring["cadence"], string> = { monthly: "month", weekly: "week", yearly: "year" };
/** How many regular payments show before the rest fold into "N more". */
const RECURRING_SHOWN = 5;
/** The logging-habit strip is the last 14 days (fewer when the data is younger); the sentence under it counts 30. */
const STRIP_DAYS = 14;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function InsightCard({ i, years, rate }: { i: Insight; years: number; rate: number }) {
  const sev = SEVERITY[i.severity];
  const Icon = sev.icon;
  const saves = i.annualSaving > 0;
  return (
    <article className="card" aria-labelledby={`h-${i.id}`}>
      <span className={`pill ${sev.pill}`}>
        <Icon size={12} aria-hidden /> {sev.label}
      </span>
      <h3 id={`h-${i.id}`} className="mt-2 text-sm font-black leading-snug md:text-[15px]">
        {i.title}
      </h3>
      <ul className="mt-1.5 space-y-1 text-xs font-semibold leading-relaxed text-muted">
        {i.evidence.map((e) => (
          <li key={e} className="flex gap-2">
            <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted" />
            <span>{e}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs font-bold leading-relaxed">{i.suggestion}</p>
      {saves && (
        <p className="mt-2 text-[11px] font-bold leading-relaxed text-muted">
          ≈ {formatRMWhole(i.annualSaving)} a year. Invested for {years} years at an assumed {rate}%, that grows to roughly {formatRMWhole(i.investedValue)}.
        </p>
      )}
      {(saves || i.href) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {saves && <span className="pill bg-good-soft text-good">Save about {formatRMWhole(i.monthlySaving)}/mo</span>}
          {i.href && (
            <Link href={i.href} className="ml-auto inline-flex min-h-8 items-center gap-1 whitespace-nowrap text-xs font-extrabold text-accent-strong hover:underline">
              See the entries <ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

/** One regular payment. "Add as bill" opens the bills page (there is no prefill); a payment that already matches a bill says so instead. */
function RecurringRow({ r, isBill }: { r: Recurring; isBill: boolean }) {
  return (
    <li className="rounded-2xl bg-card-subtle p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] font-extrabold">{r.item}</p>
        <p className="num shrink-0 text-[13px] font-black">{formatRM(r.amount)}</p>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="min-w-0 text-[11px] font-bold text-muted">
          Every {CADENCE[r.cadence]} · {r.category} · {formatRM(r.annualCost)} a year
        </p>
        {isBill ? (
          <span className="pill bg-card text-muted">
            <Check size={12} aria-hidden /> Already a bill
          </span>
        ) : (
          <Link href="/plan/bills" className="pill bg-card py-1.5 text-accent-strong hover:underline">
            Add as bill
          </Link>
        )}
      </div>
    </li>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const today = todayISO();
  const [rows, categories, settings, cash, plan] = await Promise.all([
    listFlowRows(shiftDays(today, -150), today),
    listCategories(),
    getSettings(),
    getCashStatus(todayISO()),
    getPlan(today),
  ]);

  const insights = detectLeaks({
    rows,
    today,
    categories: categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, monthlyBudget: c.monthlyBudget })),
    assumptions: { sp500ReturnPct: settings.sp500ReturnPct, horizonYears: settings.horizonYears },
    cash: { unaccounted90: cash.unaccounted90, withdrawn90: cash.withdrawn90 },
    flows: plan.flows,
    billItems: plan.bills.map((b) => b.bill.name),
  });
  const headline = headlineSavings(insights);
  const recurring = detectRecurring(rows, today).filter((r) => r.active);
  const recurringMonthly = recurring.reduce((s, r) => s + r.monthlyCost, 0);
  const isBill = (item: string) => plan.bills.some((b) => descriptionMatchesBill(b.bill, item));

  const since30 = shiftDays(today, -29);
  const loggedOn = new Set(rows.filter((r) => r.date >= since30).map((r) => r.date));
  const loggedDays = loggedOn.size;
  const dataSpanDays = rows.length ? daysBetween(rows[0].date, today) + 1 : 0;
  const trackedWindow = Math.min(30, Math.max(dataSpanDays, 1));
  const stripLength = Math.min(STRIP_DAYS, trackedWindow);
  const strip = Array.from({ length: stripLength }, (_, i) => {
    const date = shiftDays(today, i - (stripLength - 1));
    return { date, logged: loggedOn.has(date) };
  });
  const stripLogged = strip.filter((d) => d.logged).length;
  const gaps = strip.filter((d) => !d.logged).map((d) => shortDate(d.date));

  const recon = first(sp.recon);
  const reconAmt = Number(first(sp.amt) ?? 0);
  const daysSinceRecon = cash.lastReconciled ? daysBetween(cash.lastReconciled, today) : null;
  const needsCount = cash.accounts.length > 0 && (daysSinceRecon === null || daysSinceRecon > 14);
  const cashOnRecord = cash.accounts.reduce((s, a) => s + a.ledgerBalance, 0);

  // headlineSavings sums the three biggest findings, so with more than three the card says "the top 3".
  const heroLead =
    insights.length === 1
      ? "If you acted on this finding"
      : insights.length <= 3
        ? `If you acted on all ${insights.length} findings`
        : "If you acted on the top 3 findings";

  return (
    <div className="space-y-3 md:space-y-4">
      <MoreHeader title="Insights" subtitle="Where your money leaks, found from your own entries." />

      {/* Phone: one column in the order headline, cash, findings, habit, regular payments. From lg: findings on the left,
          the cash count and the small cards on the right. The wrappers are `contents` on a phone so `order` can interleave them. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:gap-4 lg:grid-cols-2 lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          {insights.length > 0 ? (
            <section className="hero order-1 text-center" aria-label="Summary">
              <p className="text-xs font-extrabold">{heroLead}</p>
              <p className="num mt-1.5 text-[44px] font-black leading-none tracking-[-0.03em]">{formatRMWhole(headline.monthly)}</p>
              <p className="mt-1.5 text-[13px] font-extrabold">a month back in your pocket</p>
              <p className="mt-3 text-[11px] font-bold leading-relaxed">
                ≈ {formatRMWhole(headline.annual)} a year is at stake. Invested for {settings.horizonYears} years at an assumed {settings.sp500ReturnPct}%, that could
                become roughly {formatRMWhole(headline.invested)}. Some findings overlap (a latte also sits inside Eating Out), so treat this as a ceiling.
              </p>
            </section>
          ) : (
            <section className="card order-1">
              <p className="flex items-center gap-2 text-sm font-black">
                <CheckCircle2 size={18} className="text-good" aria-hidden /> No leaks found yet
              </p>
              <p className="sub mt-1 leading-relaxed">
                {rows.length < 40
                  ? "Keep logging - patterns need a few weeks of entries, and trends need at least two months."
                  : "Nothing stands out against your own history right now. Nice."}
              </p>
            </section>
          )}

          {insights.length > 0 && (
            <section className="order-3 space-y-2.5" aria-label="Findings">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1">
                <h2 className="h2">What we found</h2>
                <p className="sub">Estimates, not verdicts</p>
              </div>
              {insights.map((i) => (
                <InsightCard key={i.id} i={i} years={settings.horizonYears} rate={settings.sp500ReturnPct} />
              ))}
            </section>
          )}
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <section id="cash" className="card order-2 scroll-mt-20 space-y-3" aria-labelledby="cash-h">
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 id="cash-h" className="h2">
                  Count your cash
                </h2>
                {cash.accounts.length > 0 && <span className="pill num bg-card-subtle text-muted">Cash · {formatRM(cashOnRecord)} on record</span>}
              </div>
              <p className="sub mt-1 leading-relaxed">
                Cash is where &quot;every penny&quot; usually breaks. Count what&apos;s in your wallet and the gap becomes a logged &quot;Unaccounted cash&quot; expense - so
                the leak is visible.
              </p>
            </div>

            {recon === "shortfall" && (
              <p role="status" className="banner banner-warn">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                Cash was {formatRM(reconAmt)} short of the books. Booked as Unaccounted cash.
              </p>
            )}
            {recon === "surplus" && (
              <p role="status" className="banner banner-good">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
                You had {formatRM(reconAmt)} more cash than the books said. Booked as a cash adjustment.
              </p>
            )}
            {recon === "match" && (
              <p role="status" className="banner banner-good">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
                Spot on - your books match your wallet.
              </p>
            )}
            {recon === "invalid" && (
              <p role="alert" className="banner banner-danger">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
                Enter the amount you counted, e.g. 85.50.
              </p>
            )}

            {cash.accounts.length === 0 ? (
              <p className="sub">Add a &quot;Cash in hand&quot; account in Settings to use this.</p>
            ) : (
              <form action={reconcileCashAction} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
                <div className="col-span-2">
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
                <button className="btn-primary self-end">Reconcile</button>
              </form>
            )}
            <p className={`text-xs ${needsCount ? "font-extrabold text-warn" : "font-bold text-muted"}`}>
              {daysSinceRecon === null
                ? "You haven't counted your cash yet - try it now."
                : daysSinceRecon === 0
                  ? "Counted today."
                  : `Last counted ${daysSinceRecon} day${daysSinceRecon === 1 ? "" : "s"} ago${needsCount ? " - time for another count." : "."}`}
            </p>
          </section>

          <section className="card order-4" aria-labelledby="habit">
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
              <h2 id="habit" className="h2">
                Logging habit
              </h2>
              <p className="sub whitespace-nowrap">
                Last {stripLength} day{stripLength === 1 ? "" : "s"}
              </p>
            </div>
            {/* accent = a day with an entry, grey = a gap; the sentence and the list of gaps below say the same in words */}
            <div className="flex gap-1" role="img" aria-label={`Logged on ${stripLogged} of the last ${stripLength} days`}>
              {strip.map((d) => (
                <div key={d.date} className={`h-7 flex-1 rounded-lg ${d.logged ? "bg-accent" : "bg-card-subtle"}`} />
              ))}
            </div>
            <p className="mt-2.5 text-[13px] font-bold">
              You logged something on <strong className="font-black">{loggedDays}</strong> of the last {trackedWindow} days.
            </p>
            <p className="sub mt-0.5 leading-relaxed">
              {loggedDays >= trackedWindow * 0.8
                ? "Great consistency - this is what makes the insights trustworthy."
                : "Gaps usually mean forgotten spending. Logging right after you pay is the habit that matters most."}
            </p>
            {gaps.length > 0 && <p className="sub mt-1">Gaps: {gaps.join(", ")}.</p>}
          </section>

          {recurring.length > 0 && (
            <section className="card order-5" aria-labelledby="recurring">
              <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 id="recurring" className="h2">
                  Regular payments we spotted ({recurring.length})
                </h2>
                <span className="pill num bg-accent-soft text-accent-strong">{formatRM(recurringMonthly)}/month</span>
              </div>
              <ul className="space-y-1.5">
                {recurring.slice(0, RECURRING_SHOWN).map((r) => (
                  <RecurringRow key={r.item} r={r} isBill={isBill(r.item)} />
                ))}
              </ul>
              {recurring.length > RECURRING_SHOWN && (
                <details className="mt-2.5">
                  <summary className="cursor-pointer text-xs font-extrabold text-accent-strong">{recurring.length - RECURRING_SHOWN} more</summary>
                  <ul className="mt-2 space-y-1.5">
                    {recurring.slice(RECURRING_SHOWN).map((r) => (
                      <RecurringRow key={r.item} r={r} isBill={isBill(r.item)} />
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
