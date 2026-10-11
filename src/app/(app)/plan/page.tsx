import { FileUp, Settings2, Users } from "lucide-react";
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

const ACTION = "btn !px-3.5 !py-2 shrink-0";

export default async function PlanPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const error = first((await searchParams).error);
  const today = todayISO();
  const plan = await getPlan(today);
  const { cycle, safe, roles, commitments, planner } = plan;
  const needsSalary = !plan.hasSalary || cycle.paydayOverdue;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PlanHeader
        subtitle={
          <>
            Pay cycle {cycleLabel(cycle)} · day {cycle.dayNumber} of {cycle.daysTotal}
            {cycle.source === "setting" && " (estimated - record your salary to make it exact)"}
          </>
        }
        actions={
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            <Link href="/import" className={ACTION}>
              <FileUp size={16} aria-hidden /> Import statement
            </Link>
            <Link href="/plan/bills" className={ACTION}>
              <Settings2 size={16} aria-hidden /> Manage bills
            </Link>
            <Link href="/plan/shared" className={ACTION}>
              <Users size={16} aria-hidden /> Shared bills
            </Link>
          </div>
        }
      />

      {error && (
        <p role="alert" className="banner banner-danger font-medium">
          {error}
        </p>
      )}

      {needsSalary && (
        <section className="card space-y-3 border-accent/40" aria-labelledby="salary-h">
          <div>
            <h2 id="salary-h" className="font-bold">
              {plan.hasSalary ? "Payday has arrived?" : "Record your salary to start"}
            </h2>
            <p className="text-sm text-muted">
              Salary landing in your spending account is what starts a pay cycle. Record it and everything on this page lines up with your real month.
            </p>
          </div>
          <form action={recordSalary} className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className="label" htmlFor="salary-amount">
                Take-home pay (RM)
              </label>
              <input id="salary-amount" name="amount" inputMode="decimal" defaultValue={planner.income ? senToInput(planner.income) : ""} placeholder="5400" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="salary-date">
                Received on
              </label>
              <input id="salary-date" name="date" type="date" defaultValue={today} required className="input" />
            </div>
            <button className="btn-primary col-span-2 self-end !py-2.5 text-sm md:col-span-1" disabled={!roles.spending}>
              Record salary
            </button>
            {!roles.spending && <p className="col-span-2 text-xs font-medium text-warn md:col-span-3">Choose your spending account in Settings first.</p>}
          </form>
        </section>
      )}

      <SafeToSpendCard safe={safe} cycle={cycle} />

      <section className="card !p-0" aria-labelledby="bills-h">
        <div className="space-y-1 p-4 pb-3">
          <h2 id="bills-h" className="text-[15px] font-bold">
            Bills this cycle
          </h2>
          {commitments.count > 0 && (
            <p className="text-sm text-muted">
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

      <section className="space-y-3" aria-labelledby="payday-h">
        <div>
          <h2 id="payday-h" className="text-[15px] font-bold">
            Payday plan
          </h2>
          <p className="text-sm text-muted">
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

      <section className="space-y-3" aria-labelledby="check-h">
        <div>
          <h2 id="check-h" className="text-[15px] font-bold">
            Savings reality check
          </h2>
          <p className="text-sm text-muted">What you move to savings versus what really stays there.</p>
        </div>
        <SavingsCheck flows={plan.flows} rolesConfigured={!!(roles.spending && roles.savings)} hasSalary={plan.hasSalary} />
      </section>
    </div>
  );
}
