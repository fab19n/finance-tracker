import { Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AccountChips } from "@/components/AccountChips";
import { AccountCycleCard } from "@/components/plan/AccountCycleCard";
import { AccountOutlookCard } from "@/components/plan/AccountOutlookCard";
import { BillChecklist } from "@/components/plan/BillChecklist";
import { PaydayCard } from "@/components/plan/PaydayCard";
import { SalaryForm } from "@/components/plan/SalaryForm";
import { PaydayPlanner } from "@/components/plan/PaydayPlanner";
import { PlanHeader } from "@/components/plan/PlanHeader";
import { SafeToSpendCard } from "@/components/plan/SafeToSpendCard";
import { SavedNotice } from "@/components/settings/SavedNotice";
import { SetupCard } from "@/components/setup/SetupCard";
import { SavingsCheck } from "@/components/plan/SavingsCheck";
import { todayISO } from "@/lib/dates";
import { formatRM, senToInput } from "@/lib/money";
import { summarizeBills } from "@/lib/plan/bills";
import { cycleLabel } from "@/lib/plan/cycle";
import { planPayday } from "@/lib/plan/payday";
import { billsPaidFrom, safeToSpend } from "@/lib/plan/safe";
import { paydayStatement } from "@/lib/plan/statement";
import { getAccountBalances } from "@/lib/queries/accounts";
import { qs, type SearchParams } from "@/lib/queries/filters";
import { getPlan } from "@/lib/queries/plan";
import { setupFacts } from "@/lib/setup";
import { listTransactions, sumTransactions, sumTransferFlow } from "@/lib/queries/transactions";

export const metadata: Metadata = { title: "Plan" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PlanPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const error = first(sp.error);
  const today = todayISO();
  const [plan, balances] = await Promise.all([getPlan(today), getAccountBalances(true)]);
  const { cycle, safe, roles, planner } = plan;
  const anyEntry = await listTransactions({ limit: 1 });
  const facts = setupFacts({ accounts: balances, hasSalary: plan.hasSalary, expectedIncome: plan.settings.expectedIncome, hasEntries: anyEntry.length > 0 });
  // Before pay is known and a spending account is chosen, "bills + allowance + buffer" against a pay of RM 0 would read as a
  // deficit (the default buffer alone does). There is nothing to plan yet, so say so instead of showing a red alert.
  const planReady = planner.income > 0;
  // The payday transfer already recorded for the cycle in progress: the planner then says so instead of offering it again.
  const movedThisCycle = plan.flows[0] && !plan.flows[0].complete ? plan.flows[0].deposited : 0;
  // Safe to spend counts everything in the spending account. If the payday split would still move money to savings, say so.
  const split = planReady ? planPayday({ income: planner.income, bills: planner.bills, allowance: planner.allowance, buffer: planner.buffer }) : null;
  const unmovedNote =
    split && split.moveToSavings > 0 && movedThisCycle === 0 && roles.savings && safe.configured
      ? `You have not moved anything to savings this cycle yet. Your payday plan would move ${formatRM(split.moveToSavings)} and keep ${formatRM(split.keepInMain)} in ${roles.spending?.name ?? "your spending account"}; the figure above counts all of it, so it falls by that much once you record the move.`
      : null;
  const needsSalary = !plan.hasSalary || cycle.paydayOverdue;
  const statement = planReady ? paydayStatement({ income: planner.income, bills: planner.bills, allowance: planner.allowance, buffer: planner.buffer }) : null;

  // One account on its own (?account=): the bills it pays and what is left in it after them, and what it did this cycle.
  // (An investment account pays no bills, so it isn't offered; an unknown id is ignored.)
  const accountId = Number(first(sp.account)) || null;
  const accountChoice = balances.find((a) => a.id === accountId && a.type !== "investment") ?? null;
  const mine = accountChoice ? billsPaidFrom(plan.bills, accountChoice.id) : null;
  const isSpending = accountChoice !== null && accountChoice.id === roles.spending?.id;
  const outlook =
    accountChoice && mine ? safeToSpend({ accountName: accountChoice.name, balance: accountChoice.balance, items: mine, daysLeft: cycle.daysLeft }) : null;
  // A cycle whose payday is overdue runs on to today (the bill checklist does the same).
  const cycleEnd = today > cycle.end ? today : cycle.end;
  const cycleRange = { from: cycle.start, to: cycleEnd };
  const [cycleTotals, cycleMoved] = accountChoice
    ? await Promise.all([sumTransactions({ ...cycleRange, accountId: accountChoice.id }), sumTransferFlow(cycleRange, accountChoice.id)])
    : [null, null];

  const billItems = mine ?? plan.bills;
  const billSummary = mine ? summarizeBills(mine) : plan.summary;
  const accountNames = new Map(balances.map((a) => [a.id, a.name]));
  const chips = balances
    .filter((a) => a.type !== "investment" && (!a.archived || a.id === accountChoice?.id))
    .map((a) => ({ id: a.id, name: a.name, balance: a.balance, cardColor: a.cardColor, href: `/plan${qs({ account: a.id })}` }));

  const billsSection = (
    <section className="space-y-2" aria-labelledby="bills-h">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="bills-h" className="label !mb-0">
          Bills this cycle{accountChoice && ` · paid from ${accountChoice.name}`}
        </h2>
        <Link href={`/plan/bills${qs({ account: accountChoice?.id })}`} className="inline-flex min-h-11 items-center text-xs font-extrabold text-accent-strong hover:underline">
          All bills
        </Link>
      </div>
      {accountChoice && billItems.length === 0 ? (
        <p className="card sub">
          No bills are paid from {accountChoice.name}.{" "}
          <Link href={`/plan/bills${qs({ account: accountChoice.id })}`} className="font-extrabold text-accent-strong hover:underline">
            Add one in Bills
          </Link>
        </p>
      ) : (
        <BillChecklist items={billItems} summary={billSummary} today={today} account={accountChoice?.id} accountNames={accountChoice ? undefined : accountNames} />
      )}
    </section>
  );

  return (
    <div className="space-y-3 md:space-y-4">
      <PlanHeader account={accountChoice?.id} />

      {!accountChoice && <SetupCard facts={facts} />}

      {error && (
        <p role="alert" className="banner banner-danger">
          {error}
        </p>
      )}
      <SavedNotice saved={sp.saved} />

      {/* The whole plan, or one account on its own (each chip shows its real balance now). */}
      <AccountChips label="Show one account" accounts={chips} selectedId={accountChoice?.id ?? null} allHref="/plan" />

      {accountChoice ? (
        <div className="space-y-3 md:space-y-4 lg:max-w-3xl">
          {/* The spending account gets the real "safe to spend" card whichever way you reach it (same maths either way). */}
          {outlook && mine && !isSpending ? <AccountOutlookCard safe={outlook} billCount={mine.filter((i) => i.status !== "not_due").length} /> : <SafeToSpendCard safe={safe} cycle={cycle} />}
          {unmovedNote && isSpending && <p className="sub px-1 leading-relaxed">{unmovedNote}</p>}
          {/* Recording the salary is an action, not an analysis: it stays available when one account is on screen. */}
          {needsSalary && (
            <section className="card space-y-3" aria-labelledby="salary-h">
              <h2 id="salary-h" className="h2">
                {plan.hasSalary ? "Payday has arrived?" : "Record your salary to start"}
              </h2>
              <SalaryForm defaultAmount={planner.income ? senToInput(planner.income) : ""} today={today} canRecord={!!roles.spending} />
            </section>
          )}
          {cycleTotals && cycleMoved && (
            <AccountCycleCard
              name={accountChoice.name}
              period={cycleLabel(cycle)}
              figures={{ income: cycleTotals.income, spent: cycleTotals.expense, movedIn: cycleMoved.in, movedOut: cycleMoved.out }}
              href={`/transactions${qs({ month: "all", from: cycle.start, to: cycleEnd, account: accountChoice.id })}`}
            />
          )}
          {billsSection}
          <p className="banner banner-info flex items-start gap-2 leading-snug">
            <Info size={18} className="mt-px shrink-0" aria-hidden />
            <span>
              The payday plan and the savings check cover the spending and savings accounts together, so they step aside here.{" "}
              <Link href="/plan" className="font-extrabold underline underline-offset-2">
                See the whole plan
              </Link>
            </span>
          </p>
        </div>
      ) : (
        // Phone: one column in the board's order (the hero, the payday plan, the savings check, the bills). From lg: two columns.
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-3 md:space-y-4">
            <SafeToSpendCard safe={safe} cycle={cycle} />
            {unmovedNote && <p className="sub px-1 leading-relaxed">{unmovedNote}</p>}
          </div>
          <PaydayCard
            statement={statement}
            spendingName={roles.spending?.name ?? null}
            cycleText={`Pay cycle ${cycleLabel(cycle)}`}
            estimated={cycle.source === "setting"}
            moved={movedThisCycle}
            salaryOpen={needsSalary}
            salaryDefault={planner.income ? senToInput(planner.income) : ""}
            today={today}
            canRecordSalary={!!roles.spending}
            hasSalary={plan.hasSalary}
            planner={
              <PaydayPlanner
                income={planner.income}
                incomeFrom={planner.incomeFrom}
                bills={planner.bills}
                allowance={planner.allowance}
                allowanceFrom={planner.allowanceFrom}
                buffer={planner.buffer}
                usualTransfer={planner.usualTransfer}
                canRecord={!!(roles.spending && roles.savings)}
                today={today}
                alreadyMoved={movedThisCycle}
              />
            }
          />
          <SavingsCheck flows={plan.flows} rolesConfigured={!!(roles.spending && roles.savings)} hasSalary={plan.hasSalary} planned={split ? split.moveToSavings : null} />
          {billsSection}
        </div>
      )}
    </div>
  );
}
