import { connection } from "next/server";
import { ChartTable } from "@/components/ChartTable";
import { BudgetRing } from "@/components/charts/BudgetRing";
import { CumulativeSpendChart } from "@/components/charts/CumulativeSpendChart";
import { IncomeExpenseChart } from "@/components/charts/IncomeExpenseChart";
import { NeedWantDonut } from "@/components/charts/NeedWantDonut";
import { Kpi } from "@/components/Kpi";
import { Meter } from "@/components/Meter";
import { MonthNav } from "@/components/MonthNav";
import { PageHeader } from "@/components/PageHeader";
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
  daysBetween,
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

const BUDGET_PILL = { ok: "bg-good-soft text-good", watch: "bg-warn-soft text-warn", over: "bg-danger-soft text-danger" } as const;
const BUDGET_TEXT = { ok: "text-good", watch: "text-warn", over: "text-danger" } as const;

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
  const daysTotal = period ? daysBetween(period.start, period.end) + 1 : daysInMonthOf(month);
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
  const vsLabel = `vs ${shortMonthLabel(prev).split(" ")[0]}${isCurrent ? " to date" : ""}`;
  // Interest of a few sen, or a friend's payback, is not a paycheck: don't call the period "overspent" before pay lands.
  const hasPay = paycheckIn(totals.income, settings.expectedIncome);
  const byCategory = categoryBreakdown(rows, month);
  const series = monthlySeries(rows, months6);
  const cumulative = cumulativeSpend(rows, month, prev, dayNow);
  const split = needWantSplit(rows, month);
  const budgets = budgetProgress(rows, categories, month, dayNow);
  const items = topItems(rows, month, 10);
  const netWorth = worth.total;
  const hasData = totals.income > 0 || totals.expense > 0;

  const wantsOver = split.vsIncome ? split.want - Math.round(split.base * 0.3) : 0;
  // The lower row is three cards when there are budgets, else two that share the width.
  const third = budgets.length > 0 ? "lg:col-span-4" : "lg:col-span-6";

  // The hero: what is left of this period's income (or, with no pay logged yet, the plain running net).
  const overspent = hasPay && totals.net < 0;
  const used = hasPay && totals.income > 0 ? totals.expense / totals.income : null;

  // "Slower than Sep": this period's running total against last period's at the same day.
  const latest = [...cumulative].reverse().find((p) => p.current !== null);
  const paceRatio = isCurrent && latest && latest.previous ? (latest.current! - latest.previous) / latest.previous : null;
  const prevName = shortMonthLabel(prev).split(" ")[0];
  const pacePill =
    paceRatio === null
      ? null
      : paceRatio <= -0.03
        ? { cls: "bg-good-soft text-good", text: `Slower than ${prevName}` }
        : paceRatio >= 0.03
          ? { cls: "bg-warn-soft text-warn", text: `Faster than ${prevName}` }
          : { cls: "bg-card-subtle text-muted", text: `On par with ${prevName}` };

  return (
    <div className="space-y-3 md:space-y-4">
      <PageHeader
        title={
          <>
            <span className="sr-only">Dashboard: </span>
            {monthLabel(month).split(" ")[0]}
          </>
        }
        subtitle={`${view === "cycle" ? "Pay cycle" : "Calendar month"} · ${isCurrent ? `day ${dayNow} of ${daysTotal}` : rangeLabel}`}
      />

      <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:gap-3">
        <PeriodToggle view={view} />
        <MonthNav
          month={month}
          maxMonth={nowMonth}
          minMonth={oldestMonth}
          path="/dashboard"
          sublabel={period ? cycleLabel(period) : undefined}
          query={`view=${view}`}
          className="md:w-72"
        />
      </div>

      <section className="grid grid-cols-3 gap-2.5 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:gap-3" aria-label="Key figures">
        <div className={`col-span-3 md:col-span-1 ${overspent ? "hero-danger" : "hero"}`}>
          <p className="mb-1.5 text-xs font-extrabold">{!hasPay ? "Net so far" : totals.net >= 0 ? "Left over" : "Overspent"}</p>
          <p className="num text-[54px] font-black leading-[0.95] tracking-[-0.03em] md:text-[44px]">
            {!hasPay && totals.net < 0 ? "−" : ""}
            {formatRMWhole(Math.abs(totals.net))}
          </p>
          {used !== null ? (
            <div className="mt-4 flex items-center gap-2.5">
              <div className="h-2 flex-1 rounded-full bg-hero-track">
                <div className="h-2 rounded-full bg-current" style={{ width: `${Math.min(100, Math.round(used * 100))}%` }} />
              </div>
              <span className="whitespace-nowrap text-xs font-extrabold">{Math.round(used * 100)}% of income used</span>
            </div>
          ) : (
            <p className="mt-3 text-xs font-extrabold">no pay in this {unit} yet</p>
          )}
        </div>
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
        <Kpi
          label="Net worth"
          value={formatRMWhole(netWorth)}
          hint={
            <>
              <span className="md:hidden">invested {formatRMWhole(worth.investments)}</span>
              <span className="hidden md:inline">
                cash {formatRMWhole(worth.liquid)} · invested {formatRMWhole(worth.investments)}
              </span>
            </>
          }
        />
      </section>

      {!hasData && (
        <div className="card py-10 text-center">
          <p className="text-sm font-black">Nothing recorded for {rangeLabel} yet.</p>
          <p className="sub mt-1">Add entries on the Add tab and the charts fill in.</p>
        </div>
      )}

      {hasData && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:gap-4 lg:grid-cols-12">
          <section className="card lg:order-1 lg:col-span-7" aria-labelledby="pace">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 id="pace" className="h2">
                Spending pace
              </h2>
              {pacePill && <span className={`pill ${pacePill.cls}`}>{pacePill.text}</span>}
            </div>
            <p className="sub mb-2">
              Running total through the {unit}
              {period && <> · day 1 is payday, {cycleLabel(period).split(" - ")[0]}</>}
            </p>
            <ul className="mb-1 flex gap-4 text-xs font-bold" aria-label="Legend">
              <li className="flex items-center gap-1.5">
                <span className="h-[3px] w-4 rounded bg-series-2" /> {nameOf(month)}
              </li>
              <li className="flex items-center gap-1.5 text-muted">
                <span className="w-4 border-t-2 border-dotted border-ink-muted" /> {nameOf(prev)}
              </li>
            </ul>
            <CumulativeSpendChart data={cumulative} currentLabel={nameOf(month)} previousLabel={nameOf(prev)} />
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

          {budgets.length > 0 && (
            <section className="card lg:order-3 lg:col-span-4" aria-labelledby="budgets">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 id="budgets" className="h2">
                  Budgets
                </h2>
                <span className="sub !text-[11px]">The tick marks an even pace</span>
              </div>
              {/* Phone: rings, three to a row. From md: bars. Same facts, once in the page for each size. */}
              <ul className="grid grid-cols-3 gap-2 md:hidden">
                {budgets.map((b) => (
                  <li key={b.categoryId} className="flex flex-col items-center gap-1.5 text-center">
                    <BudgetRing used={b.used} status={b.status} />
                    <p className="text-xs font-extrabold leading-tight">{b.name}</p>
                    <p className="num text-[11px] font-bold text-muted">
                      {formatRMWhole(b.spent).replace("RM ", "")} / {formatRMWhole(b.budget).replace("RM ", "")}
                    </p>
                    <span className={`pill !px-2 !py-0.5 ${BUDGET_PILL[b.status]}`}>
                      {b.status === "over" ? `Over by ${formatRMWhole(b.spent - b.budget)}` : b.status === "watch" ? `Watch · ${formatRMWhole(b.projected).replace("RM ", "")}` : "On track"}
                    </span>
                  </li>
                ))}
              </ul>
              <ul className="hidden space-y-3.5 md:block">
                {budgets.map((b) => (
                  <li key={b.categoryId}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-extrabold">{b.name}</span>
                      <span className={`num text-xs font-extrabold ${BUDGET_TEXT[b.status]}`}>
                        {formatRM(b.spent)} <span className="text-muted">/ {formatRM(b.budget)}</span>
                      </span>
                    </div>
                    <Meter used={b.used} pace={b.pace} status={b.status} />
                    <span className={`pill mt-1.5 !py-0.5 ${BUDGET_PILL[b.status]}`}>
                      {b.status === "over"
                        ? `Over budget by ${formatRM(b.spent - b.budget)}`
                        : b.status === "watch"
                          ? `On pace to reach ${formatRM(b.projected)}`
                          : "On track"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`card lg:order-4 ${third}`} aria-labelledby="where">
            <h2 id="where" className="h2">
              Where it went
            </h2>
            <p className="sub mb-3">Spending by category, {rangeLabel}</p>
            {byCategory.length === 0 ? (
              <p className="sub">No spending this {unit}.</p>
            ) : (
              <>
                <ul className="space-y-2.5">
                  {byCategory.slice(0, VISIBLE_CATEGORIES).map((c, i) => (
                    <li key={c.name}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs font-extrabold">
                        <span className="truncate">
                          {c.name}
                          <span className="ml-1.5 font-bold text-muted">{formatPct(c.share)}</span>
                        </span>
                        <span className="num shrink-0">{formatRM(c.total)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-card-subtle md:h-1.5">
                        {/* The longest bar is the biggest spend; each lighter step is the next one down. */}
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.max(2, c.share * 100)}%`, opacity: Math.max(0.45, 1 - i * 0.15) }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                {byCategory.length > VISIBLE_CATEGORIES && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-extrabold text-accent-strong">
                      {byCategory.length - VISIBLE_CATEGORIES} more categories
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {byCategory.slice(VISIBLE_CATEGORIES).map((c) => (
                        <li key={c.name} className="flex justify-between text-xs font-bold">
                          <span>
                            {c.name} <span className="text-muted">{formatPct(c.share)}</span>
                          </span>
                          <span className="num font-extrabold">{formatRM(c.total)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>

          <section className="card lg:order-2 lg:col-span-5" aria-labelledby="split">
            <h2 id="split" className="h2">
              Needs, wants &amp; saving
            </h2>
            <p className="sub mb-3">
              {split.vsIncome ? "Share of your income" : "Share of spending (no income recorded)"} · guide: 50 / 30 / 20
            </p>
            <div className="flex items-center gap-4">
              <NeedWantDonut need={split.need} want={split.want} saved={split.saved} />
              <ul className="min-w-0 flex-1 space-y-2.5 text-xs font-bold">
                {[
                  { label: "Needs", v: split.need, p: split.needPct, c: "bg-series-1", guide: "50%" },
                  { label: "Wants", v: split.want, p: split.wantPct, c: "bg-series-2", guide: "30%" },
                  { label: split.vsIncome ? "Saved" : "Saved (needs income)", v: split.saved, p: split.savedPct, c: "bg-series-3", guide: "20%" },
                ].map((r) => (
                  <li key={r.label}>
                    <div className="flex items-center gap-2">
                      <span className={`size-2.5 shrink-0 rounded-full ${r.c}`} />
                      <span className="font-extrabold">{r.label}</span>
                      <span className="num ml-auto font-black">{formatPct(r.p)}</span>
                    </div>
                    <p className="num pl-[18px] text-[11px] text-muted">
                      {formatRM(r.v)} · guide {r.guide}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            {split.vsIncome && wantsOver > 0 && (
              <p className="banner banner-warn mt-3 !text-xs">Wants are {formatRM(wantsOver)} over the 30% guide this {unit}.</p>
            )}
            {split.vsIncome && wantsOver <= 0 && split.need + split.want > 0 && (
              <p className="banner banner-good mt-3 !text-xs">Wants are within the 30% guide. Nice.</p>
            )}
          </section>

          {items.length > 0 && (
            <section className={`card lg:order-5 ${third}`} aria-labelledby="items">
              <h2 id="items" className="h2">
                What you buy most
              </h2>
              <p className="sub mb-3">Specific items by total this {unit} - small and frequent adds up</p>
              <ul className="space-y-2">
                {items.map((i) => (
                  <li key={i.item} className="flex items-center gap-2.5 rounded-2xl bg-card-subtle px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-extrabold">{i.item}</p>
                      <p className="truncate text-[11px] font-bold text-muted">
                        {i.category} · avg {formatRM(i.average)}
                      </p>
                    </div>
                    <span className="pill bg-card !px-2 !py-0.5 text-muted">{i.count}×</span>
                    <span className="num text-[13px] font-black">{formatRM(i.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card lg:order-6 lg:col-span-12" aria-labelledby="monthly">
            <h2 id="monthly" className="h2">
              Income vs spending
            </h2>
            <p className="sub mb-2">
              Last 6 {unit}s{period && <> · each named after the month most of it falls in</>}
            </p>
            <ul className="mb-1 flex gap-4 text-xs font-bold" aria-label="Legend">
              <li className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-series-3" /> Income
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-series-2" /> Spent
              </li>
            </ul>
            <IncomeExpenseChart data={series} />
            <ChartTable
              caption={`Income and spending by ${unit}`}
              columns={[period ? "Cycle" : "Month", "Income", "Spent", "Net"]}
              rows={series.map((p) => [nameOf(p.month), formatRM(p.income), formatRM(p.expense), formatRM(p.net)])}
            />
          </section>
        </div>
      )}
    </div>
  );
}
