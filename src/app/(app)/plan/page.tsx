import { FileUp } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { recordSalary } from "@/app/actions/plan";
import { AccountChips } from "@/components/AccountChips";
import { AccountCycleCard } from "@/components/plan/AccountCycleCard";
import { AccountOutlookCard } from "@/components/plan/AccountOutlookCard";
import { BillChecklist } from "@/components/plan/BillChecklist";
import { PaydayPlanner } from "@/components/plan/PaydayPlanner";
import { PlanHeader } from "@/components/plan/PlanHeader";
import { SafeToSpendCard } from "@/components/plan/SafeToSpendCard";
import { SavingsCheck } from "@/components/plan/SavingsCheck";
import { todayISO } from "@/lib/dates";
import { formatPct, formatRM, formatRMWhole, senToInput } from "@/lib/money";
import { monthlyCommitments, summarizeBills } from "@/lib/plan/bills";
import { cycleLabel } from "@/lib/plan/cycle";
import { billsPaidFrom, safeToSpend } from "@/lib/plan/safe";
import { getAccountBalances } from "@/lib/queries/accounts";
import { qs, type SearchParams } from "@/lib/queries/filters";
import { getPlan } from "@/lib/queries/plan";
import { sumTransactions, sumTransferFlow } from "@/lib/queries/transactions";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PlanPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const error = first(sp.error);
  const today = todayISO();
  const [plan, balances] = await Promise.all([getPlan(today), getAccountBalances(true)]);
  const { cycle, safe, roles, commitments, planner } = plan;
  const needsSalary = !plan.hasSalary || cycle.paydayOverdue;

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
  const billCommitments = mine ? monthlyCommitments(mine.map((i) => i.bill)) : commitments;
  const chips = balances
    .filter((a) => a.type !== "investment" && (!a.archived || a.id === accountChoice?.id))
    .map((a) => ({ id: a.id, name: a.name, balance: a.balance, href: `/plan${qs({ account: a.id })}` }));

  return (
    <div className="space-y-3 md:space-y-4">
      <PlanHeader
        account={accountChoice?.id}
        subtitle={
          <>
            {accountChoice && `${accountChoice.name} · `}Pay cycle {cycleLabel(cycle)} · {cycle.paydayOverdue ? "payday is due" : `day ${cycle.dayNumber} of ${cycle.daysTotal}`}
            {cycle.source === "setting" && " (estimated - record your salary to make it exact)"}
          </>
        }
        actions={
          <Link href="/import" className="btn">
            <FileUp size={14} strokeWidth={2.5} aria-hidden />
            <span className="md:hidden">Import</span>
            <span className="hidden md:inline">Import statement</span>
          </Link>
        }
      />

      {error && (
        <p role="alert" className="banner banner-danger">
          {error}
        </p>
      )}

      {/* The whole plan, or one account on its own (each chip shows its real balance now). */}
      <AccountChips label="Show one account" accounts={chips} selectedId={accountChoice?.id ?? null} allHref="/plan" />
      {accountChoice && (
        <p className="sub px-1">
          Showing only {accountChoice.name}: the bills it pays and what is left in it after them. The payday plan and the savings check are about your spending
          and savings accounts together, so they step aside.{" "}
          <Link href="/plan" className="font-extrabold text-accent-strong hover:underline">
            See the whole plan
          </Link>
        </p>
      )}

      {/* Phone: one column in this order. From lg: the card and the bills on the left, the plan and the reality check on the right
          (one account on its own is a single column). */}
      <div className={accountChoice ? "space-y-3 md:space-y-4 lg:max-w-3xl" : "grid grid-cols-[minmax(0,1fr)] gap-3 md:gap-4 lg:grid-cols-2 lg:items-start"}>
        <div className="space-y-3 md:space-y-4">
          {needsSalary && (
            <section className="card space-y-3 !bg-accent-soft" aria-labelledby="salary-h">
              <div>
                <h2 id="salary-h" className="h2">
                  {plan.hasSalary ? "Payday has arrived?" : "Record your salary to start"}
                </h2>
                <p className="sub mt-1 !text-foreground">
                  Salary landing in your spending account is what starts a pay cycle. Record it and everything on this page lines up with your real month.
                </p>
              </div>
              <form action={recordSalary} className="grid grid-cols-2 gap-2.5 md:grid-cols-[1fr_1fr_auto]">
                <div>
                  <label className="label !text-foreground" htmlFor="salary-amount">
                    Take-home pay (RM)
                  </label>
                  <input id="salary-amount" name="amount" inputMode="decimal" defaultValue={planner.income ? senToInput(planner.income) : ""} placeholder="5400" required className="input" />
                </div>
                <div>
                  <label className="label !text-foreground" htmlFor="salary-date">
                    Received on
                  </label>
                  <input id="salary-date" name="date" type="date" defaultValue={today} required className="input" />
                </div>
                <button className="btn-primary col-span-2 self-end md:col-span-1" disabled={!roles.spending}>
                  Record salary
                </button>
                {!roles.spending && <p className="col-span-2 text-xs font-extrabold text-warn md:col-span-3">Choose your spending account in Settings first.</p>}
              </form>
            </section>
          )}

          {/* The spending account gets the real "safe to spend" card whichever way you reach it (same maths either way). */}
          {accountChoice && outlook && mine && !isSpending ? (
            <AccountOutlookCard safe={outlook} billCount={mine.length} />
          ) : (
            <SafeToSpendCard safe={safe} cycle={cycle} />
          )}

          {accountChoice && cycleTotals && cycleMoved && (
            <AccountCycleCard
              name={accountChoice.name}
              period={cycleLabel(cycle)}
              figures={{ income: cycleTotals.income, spent: cycleTotals.expense, movedIn: cycleMoved.in, movedOut: cycleMoved.out }}
              href={`/transactions${qs({ month: "all", from: cycle.start, to: cycleEnd, account: accountChoice.id })}`}
            />
          )}

          <section className="card" aria-labelledby="bills-h">
            <div className="mb-3">
              <h2 id="bills-h" className="h2">
                Bills this cycle{accountChoice && ` · paid from ${accountChoice.name}`}
              </h2>
              {billCommitments.count > 0 && (
                <p className="sub mt-1 leading-relaxed">
                  {billCommitments.count} bills = <strong className="text-foreground">{formatRM(billCommitments.monthly)}</strong> a month (
                  {formatRMWhole(billCommitments.annual)} a year)
                  {planner.income > 0 && <>, {formatPct(billCommitments.monthly / planner.income)} of your pay</>}. Subscriptions and other &quot;wants&quot;:{" "}
                  <strong className="text-foreground">{formatRM(billCommitments.discretionaryMonthly)}</strong> a month ({formatRMWhole(billCommitments.discretionaryAnnual)} a
                  year).
                </p>
              )}
            </div>
            {accountChoice && billItems.length === 0 ? (
              <p className="sub">
                No bills are paid from {accountChoice.name}.{" "}
                <Link href={`/plan/bills${qs({ account: accountChoice.id })}`} className="font-extrabold text-accent-strong hover:underline">
                  Add one in Bills
                </Link>
              </p>
            ) : (
              <BillChecklist items={billItems} summary={billSummary} today={today} />
            )}
          </section>
        </div>

        {!accountChoice && (
          <div className="space-y-3 md:space-y-4">
            <section className="space-y-2" aria-labelledby="payday-h">
              <div className="px-1">
                <h2 id="payday-h" className="h2">
                  Payday plan
                </h2>
                <p className="sub mt-0.5">
                  Decide once how salary is split, instead of topping up bill by bill. Change the numbers and see what happens before moving any money.
                </p>
              </div>
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
              />
            </section>

            <section className="space-y-2" aria-labelledby="check-h">
              <div className="px-1">
                <h2 id="check-h" className="h2">
                  Savings reality check
                </h2>
                <p className="sub mt-0.5">What you move to savings versus what really stays there. Moving money isn&apos;t saving if some comes back.</p>
              </div>
              <SavingsCheck flows={plan.flows} rolesConfigured={!!(roles.spending && roles.savings)} hasSalary={plan.hasSalary} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
