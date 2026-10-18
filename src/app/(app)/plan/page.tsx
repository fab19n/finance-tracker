import { FileUp } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { recordSalary } from "@/app/actions/plan";
import { BillChecklist } from "@/components/plan/BillChecklist";
import { PaydayPlanner } from "@/components/plan/PaydayPlanner";
import { PlanHeader } from "@/components/plan/PlanHeader";
import { SafeToSpendCard } from "@/components/plan/SafeToSpendCard";
import { SavingsCheck } from "@/components/plan/SavingsCheck";
import { todayISO } from "@/lib/dates";
import { formatPct, formatRM, formatRMWhole, senToInput } from "@/lib/money";
import { cycleLabel } from "@/lib/plan/cycle";
import type { SearchParams } from "@/lib/queries/filters";
import { getPlan } from "@/lib/queries/plan";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PlanPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const error = first((await searchParams).error);
  const today = todayISO();
  const plan = await getPlan(today);
  const { cycle, safe, roles, commitments, planner } = plan;
  const needsSalary = !plan.hasSalary || cycle.paydayOverdue;

  return (
    <div className="space-y-3 md:space-y-4">
      <PlanHeader
        subtitle={
          <>
            Pay cycle {cycleLabel(cycle)} · day {cycle.dayNumber} of {cycle.daysTotal}
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

      {/* Phone: one column in this order. From lg: the card and the bills on the left, the plan and the reality check on the right. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:gap-4 lg:grid-cols-2 lg:items-start">
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

          <SafeToSpendCard safe={safe} cycle={cycle} />

          <section className="card" aria-labelledby="bills-h">
            <div className="mb-3">
              <h2 id="bills-h" className="h2">
                Bills this cycle
              </h2>
              {commitments.count > 0 && (
                <p className="sub mt-1 leading-relaxed">
                  {commitments.count} bills = <strong className="text-foreground">{formatRM(commitments.monthly)}</strong> a month (
                  {formatRMWhole(commitments.annual)} a year)
                  {planner.income > 0 && <>, {formatPct(commitments.monthly / planner.income)} of your pay</>}. Subscriptions and other &quot;wants&quot;:{" "}
                  <strong className="text-foreground">{formatRM(commitments.discretionaryMonthly)}</strong> a month ({formatRMWhole(commitments.discretionaryAnnual)} a
                  year).
                </p>
              )}
            </div>
            <BillChecklist items={plan.bills} summary={plan.summary} today={today} />
          </section>
        </div>

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
      </div>
    </div>
  );
}
