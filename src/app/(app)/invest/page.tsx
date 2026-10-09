import { RefreshCw } from "lucide-react";
import { connection } from "next/server";
import { refreshPrices } from "@/app/actions/investments";
import { ChartTable } from "@/components/ChartTable";
import { GrowthChart } from "@/components/charts/GrowthChart";
import { AddInvestmentForm } from "@/components/invest/AddInvestmentForm";
import { AdvisorSection } from "@/components/invest/AdvisorSection";
import { HoldingCard } from "@/components/invest/HoldingCard";
import { Kpi } from "@/components/Kpi";
import { todayISO } from "@/lib/dates";
import { buildAdvice } from "@/lib/investing/advisor";
import { formatPct, formatRM, formatRMWhole } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import type { SearchParams } from "@/lib/queries/filters";
import { getAdviceInput, listInvestments, portfolioSeries } from "@/lib/queries/investments";
import { getSettings } from "@/lib/settings";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InvestPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const today = todayISO();
  const [investments, adviceInput, balances, settings] = await Promise.all([
    listInvestments(today),
    getAdviceInput(),
    getAccountBalances(),
    getSettings(),
  ]);

  const advice = buildAdvice(adviceInput);
  const series = portfolioSeries(investments);
  const invested = investments.reduce((s, r) => s + r.invested, 0);
  const value = investments.reduce((s, r) => s + r.value, 0);
  const gain = value - invested;
  const liquid = balances.filter((a) => a.type !== "investment").reduce((s, a) => s + a.balance, 0);
  const funding = balances.filter((a) => a.type !== "investment").map((a) => ({ id: a.id, name: a.name }));
  const canRefresh = investments.some((r) => r.holding?.ticker && r.holding.units && r.holding.product !== "fixed_deposit");

  const error = first(sp.error);
  const priced = first(sp.priced);
  const oneYearOn = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h-page">Invest</h1>
        {canRefresh && (
          <form action={refreshPrices}>
            <button className="btn">
              <RefreshCw size={16} aria-hidden /> Refresh prices
            </button>
          </form>
        )}
      </div>

      {priced && !error && (
        <p role="status" className="rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
          Updated {priced} price{priced === "1" ? "" : "s"} from the market.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Portfolio summary">
        <Kpi label="Net worth" value={formatRMWhole(liquid + value)} hint="cash + investments" />
        <Kpi label="You put in" value={formatRMWhole(invested)} hint={`${investments.length} investment${investments.length === 1 ? "" : "s"}`} />
        <Kpi label="Worth today" value={formatRMWhole(value)} hint="current value" />
        <Kpi
          label="Growth"
          value={`${gain >= 0 ? "+" : "−"}${formatRMWhole(Math.abs(gain))}`}
          tone={gain > 0 ? "good" : gain < 0 ? "bad" : "default"}
          hint={invested > 0 ? `${gain >= 0 ? "+" : "−"}${formatPct(Math.abs(gain) / invested, 1)} on money in` : "nothing invested yet"}
        />
      </section>

      <AdvisorSection advice={advice} settings={settings} />

      <section className="space-y-4" aria-labelledby="portfolio-h">
        <h2 id="portfolio-h" className="text-lg font-semibold">
          Your investments
        </h2>

        {investments.length === 0 ? (
          <div className="card text-sm text-muted">
            Nothing here yet. Once you invest - an S&amp;P 500 fund, a fixed deposit - add it below and this page tracks how your money grows.
          </div>
        ) : (
          <>
            {series.length > 1 && (
              <div className="card">
                <h3 className="font-semibold">How your money is growing</h3>
                <p className="mb-2 text-xs text-muted">The gap between the lines is growth, not deposits</p>
                <ul className="mb-1 flex gap-4 text-xs" aria-label="Legend">
                  <li className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded bg-series-1" /> Worth today
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded" style={{ backgroundColor: "var(--series-gray)" }} /> Money you put in
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

        <details className="card" open={investments.length === 0}>
          <summary className="cursor-pointer font-semibold">Add an investment</summary>
          <div className="mt-4">
            <AddInvestmentForm fundingAccounts={funding} today={today} oneYearOn={oneYearOn} />
          </div>
        </details>
      </section>
    </div>
  );
}
