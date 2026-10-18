import { AlertCircle, CheckCircle2, Plus, RefreshCw } from "lucide-react";
import { connection } from "next/server";
import { refreshPrices } from "@/app/actions/investments";
import { ChartTable } from "@/components/ChartTable";
import { GrowthChart } from "@/components/charts/GrowthChart";
import { AddInvestmentForm } from "@/components/invest/AddInvestmentForm";
import { AdvisorSection } from "@/components/invest/AdvisorSection";
import { HoldingCard } from "@/components/invest/HoldingCard";
import { IdleSavingsCard } from "@/components/invest/IdleSavingsCard";
import { Kpi } from "@/components/Kpi";
import { MoreHeader } from "@/components/MoreHeader";
import { shortDate, todayISO } from "@/lib/dates";
import { buildAdvice } from "@/lib/investing/advisor";
import { savingsOpportunity } from "@/lib/investing/idle";
import { formatPct, formatRM, formatRMWhole } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import type { SearchParams } from "@/lib/queries/filters";
import { getAdviceInput, listInvestments, portfolioSeries } from "@/lib/queries/investments";
import { getRoleAccounts, listBills } from "@/lib/queries/plan";
import { monthlyCommitments } from "@/lib/plan/bills";
import { getSettings } from "@/lib/settings";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InvestPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const today = todayISO();
  const [investments, adviceInput, balances, settings, roles, bills] = await Promise.all([
    listInvestments(today),
    getAdviceInput(),
    getAccountBalances(),
    getSettings(),
    getRoleAccounts(),
    listBills(),
  ]);

  const advice = buildAdvice(adviceInput);
  const series = portfolioSeries(investments);
  const invested = investments.reduce((s, r) => s + r.invested, 0);
  const value = investments.reduce((s, r) => s + r.value, 0);
  const gain = value - invested;
  const liquid = balances.filter((a) => a.type !== "investment").reduce((s, a) => s + a.balance, 0);
  const funding = balances.filter((a) => a.type !== "investment").map((a) => ({ id: a.id, name: a.name }));
  // The savings account, when one is chosen: costs to cover = bills + everyday spending (tracked average,
  // else your allowance setting), never less than what you actually spend per month.
  const savingsAccount = roles.savings ? balances.find((a) => a.id === roles.savings!.id) : undefined;
  const billsMonthly = monthlyCommitments(bills).monthly;
  const idle = savingsAccount
    ? savingsOpportunity({
        balance: savingsAccount.balance,
        monthlyCosts: Math.max(adviceInput.avgMonthlyExpense, billsMonthly + settings.variableAllowance),
        targetMonths: settings.emergencyMonths,
        savingsRatePct: settings.savingsRatePct,
        fdRatePct: settings.fdRatePct,
      })
    : null;
  const canRefresh = investments.some((r) => r.holding?.ticker && r.holding.units && r.holding.product !== "fixed_deposit");
  // The newest value you or a price refresh recorded; a fixed deposit is worked out from its terms, so it has none.
  const pricesAsOf = investments.map((r) => r.lastValuedOn).filter((d): d is string => !!d).sort().pop() ?? null;

  const error = first(sp.error);
  const priced = first(sp.priced);
  const oneYearOn = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  const count = investments.length;
  const sign = gain >= 0 ? "+" : "−";

  return (
    <div className="space-y-3 md:space-y-4">
      <MoreHeader
        title="Invest"
        subtitle={count === 0 ? "Nothing invested yet" : `${count} investment${count === 1 ? "" : "s"}`}
        actions={
          canRefresh && (
            <form action={refreshPrices}>
              <button className="btn">
                <RefreshCw size={14} strokeWidth={2.5} aria-hidden />
                <span className="md:hidden">Refresh</span>
                <span className="hidden md:inline">Refresh prices</span>
              </button>
            </form>
          )
        }
      />

      {priced && !error && (
        <p role="status" className="banner banner-good">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
          Updated {priced} price{priced === "1" ? "" : "s"} from the market.
        </p>
      )}
      {error && (
        <p role="alert" className="banner banner-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {/* Phone: one column in the order summary, savings, advisor, investments. From lg: the summary and your investments on the
          left, the savings cushion and the advisor on the right. The wrappers are `contents` on a phone so `order` can interleave them. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:gap-4 lg:grid-cols-2 lg:items-start">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <section className="order-1 grid grid-cols-2 gap-2.5 md:gap-3" aria-label="Portfolio summary">
            <div className="hero col-span-2">
              <p className="text-xs font-extrabold">Portfolio worth</p>
              <p className="num mt-1.5 whitespace-nowrap text-[40px] font-black leading-none tracking-[-0.03em] md:text-[44px]">{formatRMWhole(value)}</p>
              <p className="mt-2 text-xs font-extrabold">
                {invested > 0
                  ? `${sign}${formatRMWhole(Math.abs(gain))} · ${sign}${formatPct(Math.abs(gain) / invested, 1)} since you started`
                  : "nothing invested yet"}
              </p>
              <p className="mt-2.5 text-[11px] font-bold">Net worth, with your cash: {formatRMWhole(liquid + value)}</p>
            </div>
            <Kpi label="You put in" value={formatRMWhole(invested)} hint={`${count} investment${count === 1 ? "" : "s"}`} />
            <Kpi label="Prices as of" value={pricesAsOf ? shortDate(pricesAsOf) : "No values yet"} hint="latest value recorded" />
          </section>

          <section className="order-4 space-y-3 md:space-y-4" aria-labelledby="portfolio-h">
            <h2 id="portfolio-h" className="h2 px-1">
              Your investments
            </h2>

            {investments.length === 0 ? (
              <div className="card sub leading-relaxed">
                Nothing here yet. Once you invest - an S&amp;P 500 fund, a fixed deposit - add it below and this page tracks how your money grows.
              </div>
            ) : (
              <>
                {series.length > 1 && (
                  <div className="card">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <h3 className="h2">How your money is growing</h3>
                      {invested > 0 && (
                        <span className={`pill num ${gain > 0 ? "bg-good-soft text-good" : gain < 0 ? "bg-danger-soft text-danger" : "bg-card-subtle text-muted"}`}>
                          {gain > 0 ? "+" : gain < 0 ? "−" : ""}
                          {formatPct(Math.abs(gain) / invested, 1)}
                        </span>
                      )}
                    </div>
                    <p className="sub mb-2 mt-0.5">The gap between the lines is growth, not deposits</p>
                    <ul className="mb-1 flex gap-4 text-xs font-bold" aria-label="Legend">
                      <li className="flex items-center gap-1.5">
                        <span className="h-[3px] w-4 rounded bg-series-2" aria-hidden /> Worth today
                      </li>
                      <li className="flex items-center gap-1.5 text-muted">
                        <span className="w-4 border-t-2 border-dotted border-ink-muted" aria-hidden /> Money you put in
                      </li>
                    </ul>
                    <GrowthChart data={series} />
                    <ChartTable
                      caption="Portfolio value and contributions over time"
                      columns={["Date", "Worth", "Put in", "Growth"]}
                      rows={series.slice(-24).map((p) => [p.date, formatRM(p.value), formatRM(p.contributed), formatRM(p.value - p.contributed)])}
                    />
                  </div>
                )}
                {investments.map((r) => (
                  <HoldingCard key={r.account.id} row={r} funding={funding} today={today} />
                ))}
              </>
            )}

            {/* Closed: the design's dashed "+ Add an investment" row. Open (always, when there is nothing yet): a card holding the form. */}
            <details className="group rounded-3xl border-[1.5px] border-dashed border-line open:border-transparent open:bg-card" open={investments.length === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 p-3.5 text-[13px] font-extrabold text-accent-strong [&::-webkit-details-marker]:hidden">
                <Plus size={14} strokeWidth={3} className="transition group-open:rotate-45" aria-hidden /> Add an investment
              </summary>
              <div className="px-[18px] pb-[18px] md:px-5 md:pb-5">
                <AddInvestmentForm fundingAccounts={funding} today={today} oneYearOn={oneYearOn} />
              </div>
            </details>
          </section>
        </div>

        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {idle && savingsAccount && (
            <div className="order-2">
              <IdleSavingsCard op={idle} accountName={savingsAccount.name} savingsRatePct={settings.savingsRatePct} fdRatePct={settings.fdRatePct} />
            </div>
          )}
          <div className="order-3">
            <AdvisorSection advice={advice} settings={settings} />
          </div>
        </div>
      </div>
    </div>
  );
}
