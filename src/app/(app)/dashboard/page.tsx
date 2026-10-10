import { connection } from "next/server";
import { ChartTable } from "@/components/ChartTable";
import { CumulativeSpendChart } from "@/components/charts/CumulativeSpendChart";
import { IncomeExpenseChart } from "@/components/charts/IncomeExpenseChart";
import { Kpi } from "@/components/Kpi";
import { Meter } from "@/components/Meter";
import { MonthNav } from "@/components/MonthNav";
import { PeriodToggle } from "@/components/PeriodToggle";
import { payCyclePeriods, periodDay, rekeyRows } from "@/lib/analytics/periods";
import {
  budgetProgress,
  categoryBreakdown,
  changeRatio,
  cumulativeSpend,
  daysInMonthOf,
  monthlySeries,
  monthTotals,
  needWantSplit,
  paycheckIn,
  topItems,
} from "@/lib/analytics/summary";
import {
  currentMonth,
  isMonth,
  lastMonths,
  monthEnd,
  monthLabel,
  monthStart,
  shiftMonth,
  shortMonthLabel,
  todayISO,
} from "@/lib/dates";
import { formatPct, formatRM, formatRMWhole } from "@/lib/money";
import { currentCycle, cycleLabel } from "@/lib/plan/cycle";
import { listFlowRows } from "@/lib/queries/analytics";
import type { SearchParams } from "@/lib/queries/filters";
import { getNetWorth } from "@/lib/queries/investments";
import { listSalaries } from "@/lib/queries/plan";
import { listCategories } from "@/lib/queries/reference";
import { getSettings } from "@/lib/settings";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const VISIBLE_CATEGORIES = 8;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const today = todayISO();
  const [settings, salaries] = await Promise.all([getSettings(), listSalaries()]);
  const salaryDates = salaries.map((s) => s.date);

  // Your money moves payday to payday: the salary on 26 Sep is what you live on until 25 Oct. So once a salary has been
  // recorded (the Plan page's own test) a "month" here is a pay cycle, named after the month most of it falls in;
  // otherwise, or when you ask for it, a calendar month.
  const asked = first(sp.view);
  const cycleNow = currentCycle({ today, salaryDates, paydayDay: settings.paydayDay });
  const view: "cycle" | "month" = asked === "cycle" || asked === "month" ? asked : cycleNow.source === "salary" ? "cycle" : "month";
  const periods = view === "cycle" ? payCyclePeriods({ today, salaryDates, paydayDay: settings.paydayDay }) : null;

  const nowMonth = periods ? periods[0].key : currentMonth();
  const oldestMonth = periods ? periods[periods.length - 1].key : undefined;
  const param = first(sp.month);
  const month = isMonth(param) && param <= nowMonth && (oldestMonth === undefined || param >= oldestMonth) ? param : nowMonth;
  const period = periods?.find((p) => p.key === month) ?? null;
  const prev = shiftMonth(month, -1);
  const isCurrent = month === nowMonth;
  const dayNow = period ? periodDay(period, today) : isCurrent ? Number(today.slice(8, 10)) : daysInMonthOf(month);
  const unit = period ? "cycle" : "month";
  const rangeLabel = period ? cycleLabel(period) : monthLabel(month);
  // "Oct 26" reads as the 26th of October; a cycle is called by its month: "Oct cycle".
  const nameOf = (m: string) => (period ? `${shortMonthLabel(m).split(" ")[0]} cycle` : shortMonthLabel(m));

  const months6 = lastMonths(month, 6);
  const [raw, categories, worth] = await Promise.all([
    periods && period
      ? listFlowRows((periods.find((p) => p.key === shiftMonth(month, -6)) ?? periods[periods.length - 1]).start, period.end)
      : listFlowRows(monthStart(shiftMonth(month, -6)), monthEnd(month)),
    listCategories(),
    getNetWorth(today),
  ]);
  const rows = periods ? rekeyRows(raw, periods) : raw;

  const totals = monthTotals(rows, month);
  // Mid-month, compare against the same days of last month - 9 days vs a full month would flatter you.
  const prevTotals = monthTotals(rows, prev, isCurrent ? dayNow : 31);
  const vsLabel = isCurrent ? `vs ${nameOf(prev)} to date` : `vs ${nameOf(prev)}`;
  // Interest of a few sen, or a friend's payback, is not a paycheck: don't call the period "overspent" before pay lands.
  const hasPay = paycheckIn(totals.income, settings.expectedIncome);
  const byCategory = categoryBreakdown(rows, month);
  const maxCat = byCategory[0]?.total ?? 0;
  const series = monthlySeries(rows, months6);
  const cumulative = cumulativeSpend(rows, month, prev, dayNow);
  const split = needWantSplit(rows, month);
  const budgets = budgetProgress(rows, categories, month, dayNow);
  const items = topItems(rows, month, 10);
  const netWorth = worth.total;
  const hasData = totals.income > 0 || totals.expense > 0;

  const wantsOver = split.vsIncome ? split.want - Math.round(split.base * 0.3) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h-page">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodToggle view={view} />
          <MonthNav month={month} maxMonth={nowMonth} minMonth={oldestMonth} path="/dashboard" sublabel={period ? cycleLabel(period) : undefined} query={`view=${view}`} />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Key figures">
        <Kpi
          label="Income"
          value={formatRMWhole(totals.income)}
          delta={{ ratio: changeRatio(totals.income, prevTotals.income), upIsGood: true, vs: vsLabel }}
        />
        <Kpi
          label="Spent"
          value={formatRMWhole(totals.expense)}
          delta={{ ratio: changeRatio(totals.expense, prevTotals.expense), upIsGood: false, vs: vsLabel }}
        />
        {!hasPay ? (
          // No paycheck logged yet: a red "Overspent" would just be a scare, so show the plain running net.
          <Kpi label="Net so far" value={formatRMWhole(totals.net)} hint={`no pay in this ${unit} yet`} />
        ) : (
          <Kpi
            label={totals.net >= 0 ? "Left over" : "Overspent"}
            value={formatRMWhole(Math.abs(totals.net))}
            tone={totals.net >= 0 ? "good" : "bad"}
            hint={totals.savingsRate !== null ? `${formatPct(totals.savingsRate)} of income` : undefined}
          />
        )}
        <Kpi label="Net worth" value={formatRMWhole(netWorth)} hint={`cash ${formatRMWhole(worth.liquid)} · invested ${formatRMWhole(worth.investments)}`} />
      </section>

      {!hasData && (
        <div className="card text-center text-sm text-muted">
          Nothing recorded for {rangeLabel} yet. Add entries on the Add tab and the charts fill in.
        </div>
      )}

      {hasData && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card" aria-labelledby="where">
              <h2 id="where" className="font-semibold">
                Where it went
              </h2>
              <p className="mb-3 text-xs text-muted">Spending by category, {rangeLabel}</p>
              {byCategory.length === 0 ? (
                <p className="text-sm text-muted">No spending this {unit}.</p>
              ) : (
                <>
                  <ul className="space-y-2.5">
                    {byCategory.slice(0, VISIBLE_CATEGORIES).map((c) => (
                      <li key={c.name}>
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate">
                            <span aria-hidden>{c.icon}</span> {c.name}
                            <span className="ml-1.5 text-xs text-muted">{formatPct(c.share)}</span>
                          </span>
                          <span className="num shrink-0 font-semibold">{formatRM(c.total)}</span>
                        </div>
                        <div className="h-2.5 w-full">
                          <div
                            className="h-full bg-series-1"
                            style={{ width: `${Math.max(2, (c.total / maxCat) * 100)}%`, borderRadius: "0 4px 4px 0" }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  {byCategory.length > VISIBLE_CATEGORIES && (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-xs font-medium text-accent">
                        {byCategory.length - VISIBLE_CATEGORIES} more categories
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {byCategory.slice(VISIBLE_CATEGORIES).map((c) => (
                          <li key={c.name} className="flex justify-between text-sm">
                            <span>
                              {c.icon} {c.name} <span className="text-xs text-muted">{formatPct(c.share)}</span>
                            </span>
                            <span className="num font-medium">{formatRM(c.total)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </section>

            <section className="card" aria-labelledby="pace">
              <h2 id="pace" className="font-semibold">
                Spending pace
              </h2>
              <p className="mb-2 text-xs text-muted">
                Running total through the {unit}
                {period && <> · day 1 is payday, {cycleLabel(period).split(" - ")[0]}</>}
              </p>
              <ul className="mb-1 flex gap-4 text-xs" aria-label="Legend">
                <li className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded bg-series-1" /> {nameOf(month)}
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded" style={{ backgroundColor: "var(--series-gray)" }} />{" "}
                  {nameOf(prev)}
                </li>
              </ul>
              <CumulativeSpendChart
                data={cumulative}
                currentLabel={nameOf(month)}
                previousLabel={nameOf(prev)}
              />
              <ChartTable
                caption={`Cumulative spending by day of the ${unit}`}
                columns={["Day", nameOf(month), nameOf(prev)]}
                rows={cumulative.map((p) => [
                  p.day,
                  p.current === null ? "–" : formatRM(p.current),
                  p.previous === null ? "–" : formatRM(p.previous),
                ])}
              />
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card" aria-labelledby="monthly">
              <h2 id="monthly" className="font-semibold">
                Income vs spending
              </h2>
              <p className="mb-2 text-xs text-muted">Last 6 {unit}s{period && <> · each named after the month most of it falls in</>}</p>
              <ul className="mb-1 flex gap-4 text-xs" aria-label="Legend">
                <li className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-series-3" /> Income
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-series-1" /> Spent
                </li>
              </ul>
              <IncomeExpenseChart data={series} />
              <ChartTable
                caption={`Income and spending by ${unit}`}
                columns={[period ? "Cycle" : "Month", "Income", "Spent", "Net"]}
                rows={series.map((p) => [nameOf(p.month), formatRM(p.income), formatRM(p.expense), formatRM(p.net)])}
              />
            </section>

            <section className="card" aria-labelledby="split">
              <h2 id="split" className="font-semibold">
                Needs, wants &amp; saving
              </h2>
              <p className="mb-3 text-xs text-muted">
                {split.vsIncome ? "Share of your income" : "Share of spending (no income recorded)"} · guide: 50 / 30 / 20
              </p>
              <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label="Needs, wants and saved split">
                {[
                  { v: split.need, c: "bg-series-1" },
                  { v: split.want, c: "bg-series-2" },
                  { v: split.saved, c: "bg-series-3" },
                ]
                  .filter((s) => s.v > 0)
                  .map((s, i) => (
                    <div key={i} className={s.c} style={{ flexGrow: s.v, flexBasis: 0 }} />
                  ))}
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {[
                  { label: "Needs", v: split.need, p: split.needPct, c: "bg-series-1", guide: "50%" },
                  { label: "Wants", v: split.want, p: split.wantPct, c: "bg-series-2", guide: "30%" },
                  { label: split.vsIncome ? "Saved" : "Saved (needs income)", v: split.saved, p: split.savedPct, c: "bg-series-3", guide: "20%" },
                ].map((r) => (
                  <li key={r.label} className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-sm ${r.c}`} />
                    <span>{r.label}</span>
                    <span className="num ml-auto font-semibold">{formatRM(r.v)}</span>
                    <span className="num w-24 text-right text-xs text-muted">
                      {formatPct(r.p)} <span className="opacity-70">(guide {r.guide})</span>
                    </span>
                  </li>
                ))}
              </ul>
              {split.vsIncome && wantsOver > 0 && (
                <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
                  Wants are {formatRM(wantsOver)} over the 30% guide this {unit}.
                </p>
              )}
              {split.vsIncome && wantsOver <= 0 && split.need + split.want > 0 && (
                <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent">
                  Wants are within the 30% guide. Nice.
                </p>
              )}
            </section>
          </div>

          {budgets.length > 0 && (
            <section className="card" aria-labelledby="budgets">
              <h2 id="budgets" className="font-semibold">
                Budgets
              </h2>
              <p className="mb-3 text-xs text-muted">The tick marks where you&apos;d be at an even pace</p>
              <ul className="space-y-4">
                {budgets.map((b) => (
                  <li key={b.categoryId}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                      <span>
                        {b.icon} {b.name}
                      </span>
                      <span className="num text-xs text-muted">
                        <span className="font-semibold text-foreground">{formatRM(b.spent)}</span> of {formatRM(b.budget)}
                      </span>
                    </div>
                    <Meter used={b.used} pace={b.pace} status={b.status} />
                    <p
                      className={`mt-1 text-xs font-medium ${
                        b.status === "over" ? "text-danger" : b.status === "watch" ? "text-warn" : "text-muted"
                      }`}
                    >
                      {b.status === "over"
                        ? `Over budget by ${formatRM(b.spent - b.budget)}`
                        : b.status === "watch"
                          ? `On pace to reach ${formatRM(b.projected)}`
                          : "On track"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {items.length > 0 && (
            <section className="card" aria-labelledby="items">
              <h2 id="items" className="font-semibold">
                What you buy most
              </h2>
              <p className="mb-2 text-xs text-muted">Specific items by total this {unit} - small and frequent adds up</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1.5 font-medium">Item</th>
                      <th className="py-1.5 text-right font-medium">Times</th>
                      <th className="py-1.5 text-right font-medium">Average</th>
                      <th className="py-1.5 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {items.map((i) => (
                      <tr key={i.item}>
                        <td className="py-2">
                          {i.item} <span className="text-xs text-muted">{i.category}</span>
                        </td>
                        <td className="num py-2 text-right">{i.count}</td>
                        <td className="num py-2 text-right">{formatRM(i.average)}</td>
                        <td className="num py-2 text-right font-semibold">{formatRM(i.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
