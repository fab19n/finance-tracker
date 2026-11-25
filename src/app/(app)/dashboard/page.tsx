import { ChevronRight, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AccountChips } from "@/components/AccountChips";
import { AccountCard } from "@/components/account/AccountCard";
import { BalanceHistory } from "@/components/account/BalanceHistory";
import { ChartTable } from "@/components/ChartTable";
import { CumulativeSpendChart } from "@/components/charts/CumulativeSpendChart";
import { IncomeExpenseChart } from "@/components/charts/IncomeExpenseChart";
import { NeedWantDonut } from "@/components/charts/NeedWantDonut";
import { DuoIcon } from "@/components/DuoIcon";
import { EmptyState } from "@/components/EmptyState";
import { DailySpendCard } from "@/components/home/DailySpendCard";
import { Kpi } from "@/components/Kpi";
import { Meter } from "@/components/Meter";
import { Money } from "@/components/Money";
import { MonthNav } from "@/components/MonthNav";
import { PageHeader } from "@/components/PageHeader";
import { PeriodToggle } from "@/components/PeriodToggle";
import {
  budgetAmounts,
  budgetLabel,
  budgetNote,
  daysLeftText,
  heroSizeClass,
  leftToSpendCaption,
  overBudgetBanner,
  periodName,
  periodSubtitle,
  praiseWants,
  shareLabel,
} from "@/lib/analytics/dashboard-text";
import { dailySpend } from "@/lib/analytics/daily-spend";
import { balanceHistory } from "@/lib/analytics/ledger";
import { rekeyRows, resolvePeriod } from "@/lib/analytics/periods";
import {
  accountBreakdown,
  budgetProgress,
  categoryBreakdown,
  changeRatio,
  cumulativeSpend,
  monthlySeries,
  monthTotals,
  needWantSplit,
  paycheckIn,
  topItems,
} from "@/lib/analytics/summary";
import {
  daysBetween,
  lastMonths,
  monthEnd,
  monthLabel,
  monthStart,
  shiftMonth,
  shortDate,
  todayISO,
} from "@/lib/dates";
import { initials } from "@/lib/initials";
import { formatPct, formatRM, formatRMWhole } from "@/lib/money";
import { asBillTxs, evaluateBills, toBudgetBills } from "@/lib/plan/bills";
import { currentCycle, cycleLabel } from "@/lib/plan/cycle";
import { getAccountBalances } from "@/lib/queries/accounts";
import { listFlowRows } from "@/lib/queries/analytics";
import { qs, type SearchParams } from "@/lib/queries/filters";
import { getNetWorth } from "@/lib/queries/investments";
import { getAccountLedger } from "@/lib/queries/ledger";
import { listBills, listSalaries } from "@/lib/queries/plan";
import { getPlan } from "@/lib/queries/plan";
import { listCategories } from "@/lib/queries/reference";
import { sumTransferFlow } from "@/lib/queries/transactions";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Home" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const VISIBLE_CATEGORIES = 8;

const BUDGET_PILL = { ok: "bg-good-soft text-good", watch: "bg-warn-soft text-warn", over: "bg-danger-soft text-danger" } as const;
/** A card title as the design draws it: 11 px, bold, uppercase, tracked, muted. */
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.1em] text-muted";
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
  // (Insights asks the same question of the same function, so both pages cut the same periods.)
  const cycleNow = currentCycle({ today, salaryDates, paydayDay: settings.paydayDay });
  const choice = resolvePeriod({ today, salaryDates, paydayDay: settings.paydayDay, view: first(sp.view), month: first(sp.month) });
  const { view, periods, period, month, prev, nowMonth, oldestMonth, isCurrent, dayNow, unit } = choice;
  const rangeLabel = period ? cycleLabel(period) : monthLabel(month);
  const daysTotal = choice.total;
  // "Oct 26" reads as the 26th of October: a period is called by its month ("Oct"), a cycle by its month too ("Oct cycle").
  const nameOf = (m: string) => periodName(m, month, !!period);

  const months6 = lastMonths(month, 6);
  const [raw, categories, worth, accounts, billDefs, plan] = await Promise.all([
    periods && period
      ? listFlowRows((periods.find((p) => p.key === shiftMonth(month, -6)) ?? periods[periods.length - 1]).start, period.end)
      : listFlowRows(monthStart(shiftMonth(month, -6)), monthEnd(month)),
    listCategories(),
    getNetWorth(today),
    getAccountBalances(true),
    listBills(),
    // What is left to spend (the Plan's own maths) is only the answer for the period in progress, for the whole book.
    isCurrent && !Number(first(sp.account)) ? getPlan(today) : Promise.resolve(null),
  ]);
  // One account on its own (?account=): the same page over just the money that came into / went out of it. The pay cycles
  // above were cut from ALL salaries first, so a cycle means the same thing whichever account you look at.
  const accountId = Number(first(sp.account)) || null;
  const accountChoice = accounts.find((a) => a.id === accountId) ?? null;
  const allRows = periods ? rekeyRows(raw, periods) : raw;
  const rows = accountChoice ? allRows.filter((r) => r.accountId === accountChoice.id) : allRows;

  const totals = monthTotals(rows, month);
  // Mid-month, compare against the same days of last month - 9 days vs a full month would flatter you.
  const prevTotals = monthTotals(rows, prev, isCurrent ? dayNow : 31);
  const prevPeriodName = nameOf(prev);
  const vsLabel = `vs ${prevPeriodName}${isCurrent ? " to date" : ""}`;
  // Interest of a few sen, or a friend's payback, is not a paycheck: don't call the period "overspent" before pay lands.
  const hasPay = paycheckIn(totals.income, settings.expectedIncome);
  const byCategory = categoryBreakdown(rows, month);
  const byAccount = accountBreakdown(rows, month);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const colorOf = new Map(categories.map((c) => [c.id, c.color]));
  // Every figure here opens the entries behind it, for THIS period: a pay cycle (26 Sep - 25 Oct) is not a calendar month,
  // so it goes as a date range; a calendar month goes as the month.
  // With one account on screen they open that account's entries.
  const entryQuery = (extra: Record<string, string | number | undefined>) =>
    qs(period ? { month: "all", from: period.start, to: period.end, account: accountChoice?.id, ...extra } : { month, account: accountChoice?.id, ...extra });
  const entries = (extra: Record<string, string | number | undefined>) => `/transactions${entryQuery(extra)}`;
  // The account chips and the toggles keep what you were looking at (the view, the period) and change only the account.
  const accountHref = (id: number | null) => `/dashboard${qs({ view, month, account: id ?? undefined })}`;
  const accountQuery = accountChoice ? `&account=${accountChoice.id}` : "";
  const chips = accounts
    .filter((a) => !a.archived || a.id === accountChoice?.id)
    .map((a) => ({ id: a.id, name: a.name, balance: a.balance, href: accountHref(a.id), cardColor: a.cardColor }));
  // The balance through the period (never past today), from the account's whole history.
  const historyFrom = period ? period.start : monthStart(month);
  const historyTo = period ? period.end : monthEnd(month);
  const [ledger, moved] = accountChoice
    ? await Promise.all([getAccountLedger(accountChoice.id), sumTransferFlow({ from: historyFrom, to: historyTo }, accountChoice.id)])
    : [null, null];
  const history =
    accountChoice && ledger
      ? balanceHistory(ledger.opening, ledger.entries, accountChoice.id, { from: historyFrom, to: historyTo < today ? historyTo : today })
      : null;
  const series = monthlySeries(rows, months6);
  const cumulative = cumulativeSpend(rows, month, prev, dayNow);
  const split = needWantSplit(rows, month, hasPay);
  // Budgets are for the whole book: a category's limit measured against one account's share of it would say "on track" about
  // money that is simply paid from somewhere else. So they sit out an account view.
  // The pace is against the period's real length (a cycle named after a 30-day month can run 31 days), and a bill is not a
  // drip: the Plan's own checklist (same `findPayment`) says which are paid this period, so they are never extrapolated.
  const budgetElapsed = choice.elapsed;
  const budgetBills = toBudgetBills(
    evaluateBills(billDefs, period ? { start: period.start, end: period.end } : { start: monthStart(month), end: monthEnd(month) }, asBillTxs(raw), today),
  );
  const budgets = accountChoice ? [] : budgetProgress(rows, categories, month, dayNow, { elapsed: budgetElapsed, total: daysTotal, bills: budgetBills });
  // The daily calendar needs the entries' real dates (`raw`, not `rows`): re-filed cycle days would land on the wrong
  // weekdays. Like a budget, the limit is for the whole book, so the card sits out an account view too.
  const daily =
    !accountChoice && settings.dailyLimit > 0
      ? dailySpend(raw, { start: choice.start, end: choice.end, today, limit: settings.dailyLimit, bills: budgetBills })
      : null;
  const items = topItems(rows, month, 10);
  const netWorth = worth.total;
  const hasData = totals.income > 0 || totals.expense > 0;
  // The cards only the whole book gets: daily spending, and Budgets (or the prompt to set one). "By account" too.
  const wholeBook = hasData && !accountChoice;
  const showByAccount = !accountChoice && byAccount.length > 0;
  // The six-period trend is worth showing whenever ANY of the periods has something, even when this one is still empty.
  const hasHistory = series.some((p) => p.income > 0 || p.expense > 0);

  const wantsOver = split.vsIncome ? split.want - Math.round(split.base * 0.3) : 0;
  const latestPair = series.length > 0 ? series[series.length - 1] : null;

  // The hero. Whole book, period in progress, with a spending account and a recorded salary: LEFT TO SPEND, the Plan's own
  // safe-to-spend (the spending account's balance less the bills it still has to pay before payday). Otherwise, and for
  // past periods, the honest fallback: what is left of this period's income (or, with no pay logged yet, the plain running
  // net), and the caption says why it is not the other. For one account it is plainly the money in minus the money out:
  // never "overspent" (a cash wallet only ever has money going out), with no "income used" bar, since the pay is not what
  // lands in every account.
  // The Plan's "left to spend" is about the PAY CYCLE: in calendar-month view the hero stays "Left over" for that month.
  const left = plan && plan.safe.configured && plan.hasSalary && view === "cycle" ? plan : null;
  const leftShort = left !== null && left.safe.safe < 0;
  const overspent = left ? leftShort : !accountChoice && hasPay && totals.net < 0;
  const used = !accountChoice && hasPay && totals.income > 0 ? totals.expense / totals.income : null;
  const heroLabel = accountChoice
    ? `Net in ${accountChoice.name}`
    : left
      ? "Left to spend"
      : !hasPay
        ? isCurrent
          ? "Net so far"
          : "Net"
        : totals.net >= 0
          ? `Left over this ${unit}`
          : "Overspent";
  // Days until this period ends (the day before the next payday for a pay cycle), counting today. Only for the one in
  // progress. When the expected payday has come and no salary is recorded, the cycle just runs to today: say "Payday due".
  const payOverdue = !!period && isCurrent && cycleNow.paydayOverdue;
  const daysLeft = isCurrent ? Math.max(1, daysBetween(today, period ? period.end : monthEnd(month)) + 1) : null;
  const heroSen = left ? left.safe.safe : totals.net;
  const heroFigure = formatRMWhole(Math.abs(heroSen));
  const heroSign = heroSen < 0 && (left || accountChoice || !hasPay) ? "−" : accountChoice && heroSen > 0 ? "+" : "";
  const overBudget = !accountChoice && isCurrent ? [...budgets].filter((b) => b.status === "over").sort((a, b) => b.spent - b.budget - (a.spent - a.budget))[0] : undefined;
  const budgetDaysLeft = isCurrent && !payOverdue ? daysLeft : null;

  // The accounts beside the hero from md up: Main first, then Savings, then the rest; investments have their own page.
  const rank = (a: { purpose: string | null }) => (a.purpose === "spending" ? 0 : a.purpose === "savings" ? 1 : 2);
  const heroCards = accountChoice
    ? []
    : accounts
        .filter((a) => !a.archived && a.type !== "investment")
        .sort((a, b) => rank(a) - rank(b))
        .slice(0, 3);

  // "Slower than Sep": this period's running total against last period's at the same day.
  const latest = [...cumulative].reverse().find((p) => p.current !== null);
  const paceRatio = isCurrent && latest && latest.previous ? (latest.current! - latest.previous) / latest.previous : null;
  const prevName = prevPeriodName;
  const pacePill =
    paceRatio === null
      ? null
      : paceRatio <= -0.03
        ? { cls: "bg-good-soft text-good", text: `Slower than ${prevName}` }
        : paceRatio >= 0.03
          ? { cls: "bg-warn-soft text-warn", text: `Faster than ${prevName}` }
          : { cls: "bg-card-subtle text-muted", text: `On par with ${prevName}` };

  const heroDays = left
    ? daysLeftText(left.cycle.daysLeft, "payday", left.cycle.paydayOverdue)
    : !accountChoice && daysLeft !== null
      ? daysLeftText(daysLeft, period ? "payday" : "month", payOverdue)
      : null;
  const hero = (
    <div className={`flex flex-col ${accountChoice ? "" : "md:min-h-[200px]"} ${overspent ? "hero-danger" : "hero"}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className={`${EYEBROW} !text-current`}>{heroLabel}</p>
        {heroDays && <p className="shrink-0 text-xs font-extrabold">{heroDays}</p>}
      </div>
      <p className={`num break-words font-black leading-none tracking-[-0.03em] ${heroSizeClass(heroFigure)}`}>
        {heroSign}
        <Money sen={Math.abs(heroSen)} />
      </p>
      {left ? (
        <>
          <p className="mt-2.5 text-[13px] font-extrabold">{leftToSpendCaption(left.safe.safe, left.safe.perDay, left.cycle.daysLeft, left.cycle.paydayOverdue)}</p>
          <p className="mt-0.5 text-xs font-bold">
            in {left.safe.accountName}, after {left.safe.unpaidCount === 0 ? "bills (all paid)" : `${left.safe.unpaidCount} ${left.safe.unpaidCount === 1 ? "bill" : "bills"} still to pay`}
          </p>
          <div className="mt-auto pt-4">
            <div className="h-2 rounded-full bg-hero-track">
              <div className="h-2 rounded-full bg-current" style={{ width: `${Math.min(100, Math.round((left.cycle.dayNumber / left.cycle.daysTotal) * 100))}%` }} />
            </div>
            <p className="mt-2 flex justify-between gap-2 text-xs font-extrabold">
              <span>
                Day {left.cycle.dayNumber} of {left.cycle.daysTotal}
              </span>
              <span>{left.cycle.paydayOverdue ? `Payday was ${shortDate(left.cycle.nextPayday)}` : `Payday ${shortDate(left.cycle.nextPayday)}`}</span>
            </p>
          </div>
        </>
      ) : accountChoice ? (
        <p className="mt-3 text-xs font-extrabold">money in minus money out, {isCurrent ? `${unit} so far` : `this ${unit}`}</p>
      ) : (
        <>
          {overspent && daysLeft !== null && !payOverdue && <p className="mt-2.5 text-[13px] font-extrabold">{leftToSpendCaption(-1, null, daysLeft)}</p>}
          {used !== null ? (
            <div className="mt-auto flex items-center gap-2.5 pt-4">
              <div className="h-2 flex-1 rounded-full bg-hero-track">
                <div className="h-2 rounded-full bg-current" style={{ width: `${Math.min(100, Math.round(used * 100))}%` }} />
              </div>
              <span className="whitespace-nowrap text-xs font-extrabold">{Math.round(used * 100)}% of income used</span>
            </div>
          ) : (
            <p className="mt-3 text-xs font-extrabold">no pay in this {unit} yet</p>
          )}
          {isCurrent && plan && (
            <p className="mt-2 text-xs font-bold">
              {plan.safe.configured ? "Record your salary" : "Choose your spending account"} to see what is left to spend before payday.{" "}
              <Link href={plan.safe.configured ? "/plan" : "/settings?tab=accounts"} className="font-extrabold underline underline-offset-2">
                {plan.safe.configured ? "Open the Plan" : "Set it in Settings"}
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );

  const periodControls = (
    <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:gap-3">
      <PeriodToggle view={view} account={accountChoice?.id} month={month} />
      <MonthNav
        month={month}
        maxMonth={nowMonth}
        minMonth={oldestMonth}
        path="/dashboard"
        sublabel={period ? cycleLabel(period) : undefined}
        query={`view=${view}${accountQuery}`}
        className="md:w-72"
      />
      <Link
        href={`/insights${qs({ view, month, account: accountChoice?.id })}`}
        className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-xs font-extrabold text-accent-strong underline underline-offset-2 md:ml-auto"
      >
        What Insights found for {nameOf(month)} <ChevronRight size={14} aria-hidden />
      </Link>
    </div>
  );
  // Which account: the whole book, or one account on its own (each chip's link names its real balance).
  const accountRow = <AccountChips compact label="Show one account" accounts={chips} selectedId={accountChoice?.id ?? null} allHref={accountHref(null)} />;

  const kpiGrid = (
    <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3" aria-label="Key figures">
      {accountChoice ? (
        <>
          <Kpi
            label="Money in"
            value={formatRMWhole(totals.income)}
            tone="good"
            delta={{ ratio: changeRatio(totals.income, prevTotals.income), upIsGood: true, vs: vsLabel, prevName: prevPeriodName, diff: totals.income - prevTotals.income }}
          />
          <Kpi
            label="Money out"
            value={formatRMWhole(totals.expense)}
            delta={{ ratio: changeRatio(totals.expense, prevTotals.expense), upIsGood: false, vs: vsLabel, prevName: prevPeriodName, diff: totals.expense - prevTotals.expense }}
          />
          <Kpi label="Moved out" value={formatRMWhole(moved?.out ?? 0)} hint="transfers to your other accounts" />
          <Kpi label="Balance now" value={formatRMWhole(accountChoice.balance)} hint={accountChoice.name} tone={accountChoice.balance < 0 ? "bad" : "default"} />
        </>
      ) : (
        <>
          <Kpi label={hasPay ? "Left over" : "Net so far"} value={formatRMWhole(totals.net)} hint={hasPay ? "income minus spent" : "no pay recorded yet"} tone={hasPay && totals.net < 0 ? "bad" : "default"} />
          <Kpi
            label="Spent"
            value={formatRMWhole(totals.expense)}
            delta={{ ratio: changeRatio(totals.expense, prevTotals.expense), upIsGood: false, vs: vsLabel, prevName: prevPeriodName, diff: totals.expense - prevTotals.expense }}
          />
          <Kpi
            label="Income"
            value={formatRMWhole(totals.income)}
            delta={{ ratio: changeRatio(totals.income, prevTotals.income), upIsGood: true, vs: vsLabel, prevName: prevPeriodName, diff: totals.income - prevTotals.income }}
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
        </>
      )}
    </section>
  );

  return (
    <div className="space-y-3 md:space-y-4">
      <PageHeader title="Home" subtitle={periodSubtitle({ account: accountChoice?.name, cycle: view === "cycle", isCurrent, dayNow, daysTotal })} />

      {/* The whole book opens on the hero (and, from md up, the accounts beside it); one account keeps its controls first. */}
      {accountChoice ? (
        <>
          {periodControls}
          {accountRow}
          <section aria-label="Net in this account">{hero}</section>
        </>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-[250px_minmax(0,1fr)] md:gap-4" aria-label="Left to spend and your accounts">
            {hero}
            {heroCards.length > 0 && (
              <ul className="hidden auto-cols-fr grid-flow-col gap-3 md:grid" aria-label="Accounts">
                {heroCards.map((a) => (
                  <li key={a.id} className="min-w-0">
                    <Link href={`/accounts/${a.id}`} className="block rounded-[24px]">
                      <AccountCard account={a} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {overBudget && <p className="banner banner-warn">{overBudgetBanner(overBudget, payOverdue ? null : daysLeft, payOverdue)}</p>}
          {periodControls}
          {accountRow}
        </>
      )}
      {kpiGrid}

      {accountChoice && history && (
        <BalanceHistory name={accountChoice.name} history={history} period={rangeLabel} statementHref={`/transactions/export${entryQuery({ format: "statement" })}`} />
      )}
      {accountChoice && (
        <p className="banner banner-info">
          <span>
            Showing only {accountChoice.name}: money that came into it and went out of it. Transfers are left out. Budgets, daily spending and &quot;By account&quot; measure the whole book, so one
            account would be misleading: they step aside.{" "}
            <Link href={entries({})} className="font-extrabold underline underline-offset-2">
              See its entries
            </Link>
          </span>
        </p>
      )}

      {!hasData && (
        <EmptyState
          icon={<Wallet size={28} />}
          title={`Nothing recorded for ${rangeLabel}${accountChoice ? ` in ${accountChoice.name}` : ""} yet`}
          text="Add entries, or import a statement, and the charts fill in."
          primary={{ label: "Add your first entry", href: "/" }}
          secondary={{ label: "Import a statement", href: "/import" }}
        />
      )}

      {(hasData || hasHistory) && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
          {hasData && (
            <section className={`card ${budgets.length === 0 && accountChoice ? "lg:col-span-2" : ""}`} aria-labelledby="pace">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="pace" className={EYEBROW}>
                  {isCurrent ? "Spent so far" : "Spent"}
                </h2>
                <span className="num font-display text-base font-semibold">
                  <Money sen={totals.expense} />
                </span>
              </div>
              <p className="sub mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  Running total through the {unit}
                  {period && <> · day 1 is payday, {cycleLabel(period).split(" - ")[0]}</>}
                </span>
                {pacePill && <span className={`pill ${pacePill.cls}`}>{pacePill.text}</span>}
              </p>
              <CumulativeSpendChart data={cumulative} currentLabel={nameOf(month)} previousLabel={nameOf(prev)} partial={isCurrent} />
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] font-semibold" aria-label="Legend">
                <li className="flex items-center gap-1.5">
                  <span className="h-[3px] w-3.5 rounded bg-series-2" aria-hidden /> This {unit}
                </li>
                {cumulative.some((p) => p.previous !== null && p.previous > 0) && (
                  <li className="flex items-center gap-1.5 text-muted">
                    <span className="w-3.5 border-t-2 border-dotted border-ink-muted" aria-hidden /> Last {unit}
                  </li>
                )}
              </ul>
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
          )}

          {/* Second: the daily calendar. On a phone it is only as wide as it needs to be; from lg up it is the middle column. */}
          {wholeBook && <DailySpendCard daily={daily} className="mx-auto w-fit max-w-full lg:mx-0 lg:w-auto" />}

          {hasData && (
            <section className="card" aria-labelledby="split">
              <h2 id="split" className={EYEBROW}>
                50 / 30 / 20
              </h2>
              <p className="sub mb-3 mt-1">
                {split.vsIncome ? "Share of your income" : "Share of spending (no income recorded)"} · guide: 50 / 30 / 20
              </p>
              <p className="sub -mt-2 mb-3">
                The guide: about half your income for needs, 30% for wants and 20% kept. &quot;Not spent&quot; is what is left of your income, not money moved to savings.
              </p>
              <div className="flex items-center gap-4">
                <NeedWantDonut need={split.need} want={split.want} saved={split.saved} savedPct={split.vsIncome ? split.savedPct : undefined} />
                <ul className="min-w-0 flex-1 space-y-2.5 text-xs font-bold">
                  {[
                    { label: "Needs", v: split.need, p: split.needPct, c: "bg-series-1", guide: "50%" },
                    { label: "Wants", v: split.want, p: split.wantPct, c: "bg-series-2", guide: "30%" },
                    { label: split.vsIncome ? "Not spent" : "Not spent (needs income)", v: split.saved, p: split.savedPct, c: "bg-series-3", guide: "20%" },
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
              {split.vsIncome && wantsOver <= 0 && split.need + split.want > 0 && praiseWants(isCurrent, dayNow, daysTotal) && (
                <p className="banner banner-good mt-3 !text-xs">Wants are within the 30% guide. Nice.</p>
              )}
            </section>
          )}

          {/* The markup is in the order a phone shows. The one difference from lg up: Budgets (order 0) comes before this chart
              and starts the second row, and everything below follows the chart (order 2). */}
          <section className={`card lg:order-1 ${wholeBook ? "lg:col-span-2" : "lg:col-span-3"}`} aria-labelledby="monthly">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="monthly" className={EYEBROW}>
                Income and spending
              </h2>
              <span className="sub">Last 6 {unit}s</span>
            </div>
            <p className="sub mb-1">{period ? "Each one is named after the month most of it falls in" : "One column pair per month"}</p>
            <IncomeExpenseChart data={series} cycle={!!period} partial={isCurrent} />
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] font-semibold" aria-label="Legend">
              <li className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px] bg-series-3" aria-hidden /> Income
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-[3px] bg-series-2"
                  style={{ backgroundImage: "repeating-linear-gradient(45deg, var(--card) 0 1.5px, transparent 1.5px 3.5px)" }}
                  aria-hidden
                />{" "}
                Spent (striped)
              </li>
              <li className="text-muted">{series.length > 0 ? nameOf(series[series.length - 1].month) : "This one"} {isCurrent ? "is so far" : "is complete"}</li>
            </ul>
            {latestPair && (
              <p className="num mt-1 text-xs font-bold">
                {nameOf(latestPair.month)}: income {formatRM(latestPair.income)} · spent {formatRM(latestPair.expense)}
              </p>
            )}
            <ChartTable
              caption={`Income and spending by ${unit}`}
              columns={[period ? "Cycle" : "Month", "Income", "Spent", "Net"]}
              rows={series.map((p) => [nameOf(p.month), formatRM(p.income), formatRM(p.expense), formatRM(p.net)])}
            />
          </section>

          {hasData && (
            <>
          {budgets.length > 0 && (
            <section className="card" aria-labelledby="budgets">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 id="budgets" className={EYEBROW}>
                  Budgets
                </h2>
                {budgetDaysLeft !== null && (
                  <span className="text-xs font-extrabold">
                    {budgetDaysLeft} {budgetDaysLeft === 1 ? "day" : "days"} left
                  </span>
                )}
              </div>
              {/* One list on every size: a round disc, the name and "RM 640 of 700", a thin bar with the even-pace tick. */}
              <ul className="space-y-3.5">
                {budgets.map((b) => {
                  const tint = colorOf.get(b.categoryId);
                  const note = budgetNote(b);
                  return (
                    <li key={b.categoryId}>
                      <Link href={entries({ category: b.categoryId })} className="flex min-h-11 items-center gap-3 rounded-xl hover:bg-nav-active" aria-label={budgetLabel(b)}>
                        <span
                          aria-hidden
                          className="grid size-9 shrink-0 place-items-center rounded-full bg-card-subtle text-[11px] font-extrabold"
                          style={tint ? { backgroundColor: `${tint}26` } : undefined}
                        >
                          {initials(b.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="mb-1.5 flex items-baseline justify-between gap-2">
                            <span className="truncate text-[13px] font-extrabold">{b.name}</span>
                            <span className={`num shrink-0 text-xs font-extrabold ${b.status === "ok" ? "" : BUDGET_TEXT[b.status]}`}>{budgetAmounts(b.spent, b.budget)}</span>
                          </span>
                          {/* A category that is all bills has no "even pace": the tick would only suggest it is ahead. */}
                          <Meter used={b.used} pace={b.settled ? undefined : b.pace} status={b.status} settled={b.settled} thin label={`${b.name} budget`} />
                          {note && <span className={`pill mt-1.5 !py-0.5 ${BUDGET_PILL[b.settled && b.status === "ok" ? "ok" : b.status]}`}>{note}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="sub mt-3 !text-[11px]">The small tick is where you would be today at an even pace.</p>
            </section>
          )}

          {!accountChoice && budgets.length === 0 && (
            <p className="sub card">
              No budgets yet. Give a category a monthly limit and this page shows how each one is going.{" "}
              <Link href="/settings?tab=categories" className="font-extrabold text-accent-strong underline underline-offset-2">
                Set a budget
              </Link>
            </p>
          )}

          {/* In the last row, whichever card ends it takes the width that is left: no hole when "By account" or the items
              list sits out (one account on screen, or a period with no spending yet). */}
          <section className={`card lg:order-2 ${!showByAccount && items.length === 0 ? "lg:col-span-3" : ""}`} aria-labelledby="where">
            <h2 id="where" className={EYEBROW}>
              Where it went
            </h2>
            <p className="sub mb-3 mt-1">Spending by category, {rangeLabel} · tap one to see its entries</p>
            {byCategory.length === 0 ? (
              <p className="sub">No spending this {unit}.</p>
            ) : (
              <>
                <ul className="space-y-2.5">
                  {byCategory.slice(0, VISIBLE_CATEGORIES).map((c) => {
                    const dot = c.categoryId ? colorOf.get(c.categoryId) : undefined;
                    const row = (
                      <>
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs font-extrabold">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {dot && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
                            <span className="truncate">{c.name}</span>
                            <span className="font-bold text-muted">{formatPct(c.share)}</span>
                          </span>
                          <span className="num shrink-0">{formatRM(c.total)}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-line md:h-1.5">
                          {/* The bar is the share of all spending; the dot is the category's own colour. */}
                          <div className="h-full rounded-full bg-accent-strong" style={{ width: `${Math.max(2, c.share * 100)}%` }} />
                        </div>
                      </>
                    );
                    return (
                      <li key={c.name}>
                        {c.categoryId ? (
                          <Link href={entries({ category: c.categoryId })} className="block rounded-lg hover:bg-nav-active" aria-label={shareLabel(c.name, c.total, c.share)}>
                            {row}
                          </Link>
                        ) : (
                          row
                        )}
                      </li>
                    );
                  })}
                </ul>
                {byCategory.length > VISIBLE_CATEGORIES && (
                  <details className="group mt-3">
                    <summary className="flex min-h-11 cursor-pointer items-center gap-1 text-xs font-extrabold text-accent-strong">
                      <ChevronRight size={14} aria-hidden className="shrink-0 transition-transform group-open:rotate-90" />
                      {byCategory.length - VISIBLE_CATEGORIES} more categories
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {byCategory.slice(VISIBLE_CATEGORIES).map((c) => (
                        <li key={c.name} className="flex justify-between text-xs font-bold">
                          {c.categoryId ? (
                            <Link href={entries({ category: c.categoryId })} className="hover:underline">
                              {c.name} <span className="text-muted">{formatPct(c.share)}</span>
                            </Link>
                          ) : (
                            <span>
                              {c.name} <span className="text-muted">{formatPct(c.share)}</span>
                            </span>
                          )}
                          <span className="num font-extrabold">{formatRM(c.total)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>

          {showByAccount && (
            <section className={`card lg:order-2 ${items.length === 0 ? "lg:col-span-2" : ""}`} aria-labelledby="by-account">
              <h2 id="by-account" className={EYEBROW}>
                By account
              </h2>
              <p className="sub mb-3 mt-1">Where the spending was paid from · tap one to see its entries</p>
              <ul className="space-y-2.5">
                {byAccount.map((a) => (
                  <li key={a.accountId}>
                    <Link
                      href={entries({ account: a.accountId })}
                      className="flex min-h-11 items-center gap-3 rounded-lg hover:bg-nav-active"
                      aria-label={shareLabel(accountName.get(a.accountId) ?? "Account", a.total, a.share)}
                    >
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong">
                        <DuoIcon name="accounts" size={18} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="mb-1 flex items-baseline justify-between gap-2 text-xs font-extrabold">
                          <span className="truncate">
                            {accountName.get(a.accountId) ?? "Account"}
                            <span className="ml-1.5 font-bold text-muted">{formatPct(a.share)}</span>
                          </span>
                          <span className="num shrink-0">{formatRM(a.total)}</span>
                        </span>
                        <span className="block h-2 w-full rounded-full bg-line md:h-1.5">
                          <span className="block h-full rounded-full bg-accent-strong" style={{ width: `${Math.max(2, a.share * 100)}%` }} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {items.length > 0 && (
            <section className={`card lg:order-2 ${showByAccount ? "" : "lg:col-span-2"}`} aria-labelledby="items">
              <h2 id="items" className={EYEBROW}>
                What you buy most
              </h2>
              <p className="sub mb-3 mt-1">Specific items by total this {unit} - small and frequent adds up</p>
              <ul className="space-y-2">
                {items.map((i) => (
                  <li key={i.item}>
                    <Link href={entries({ q: i.item })} className="flex min-h-11 items-center gap-2.5 rounded-2xl bg-card-subtle px-3 py-2 hover:bg-nav-active" aria-label={`${i.item}: ${formatRM(i.total)} over ${i.count} ${i.count === 1 ? "purchase" : "purchases"}, average ${formatRM(i.average)}. See its entries`}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-extrabold">{i.item}</p>
                        <p className="truncate text-[11px] font-bold text-muted">
                          {i.category} · avg {formatRM(i.average)}
                        </p>
                      </div>
                      <span className="pill bg-card !px-2 !py-0.5 text-muted">{i.count}×</span>
                      <span className="num text-[13px] font-black">{formatRM(i.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
