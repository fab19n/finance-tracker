import type { ReactNode } from "react";
import { DuoIcon } from "@/components/DuoIcon";
import { Money } from "@/components/Money";
import { SalaryForm } from "@/components/plan/SalaryForm";
import { formatRM } from "@/lib/money";
import type { PaydayStatement } from "@/lib/plan/statement";

/**
 * The board's "Payday plan": four rows (salary expected, the bills the spending account pays, allowance and buffer kept, what
 * goes to savings) and a gold "Mark salary received". The full calculator (take-home, allowance, buffer, "I moved it") is not
 * gone: it is the `planner` child, behind "Adjust plan". The salary form opens by itself when payday is due or no salary is
 * recorded yet, because that is the one thing the page is waiting for.
 */
export function PaydayCard({
  statement,
  spendingName,
  cycleText,
  estimated,
  moved,
  salaryOpen,
  salaryDefault,
  today,
  canRecordSalary,
  hasSalary,
  planner,
}: {
  /** null until pay is known and a spending account is chosen: then there is nothing to split yet. */
  statement: PaydayStatement | null;
  spendingName: string | null;
  cycleText: string;
  /** The cycle's dates come from the Settings payday, not a recorded salary. */
  estimated: boolean;
  /** What this cycle's payday transfer to savings already came to. */
  moved: number;
  salaryOpen: boolean;
  salaryDefault: string;
  today: string;
  canRecordSalary: boolean;
  hasSalary: boolean;
  planner: ReactNode;
}) {
  const row = "flex min-h-11 items-center justify-between gap-3 py-1.5 text-[13.5px] font-semibold";
  return (
    <section className="card space-y-3" aria-labelledby="payday-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="payday-h" className="label !mb-0">
          Payday plan
        </h2>
        <span className="sub">
          {cycleText}
          {estimated && " (estimated)"}
        </span>
      </div>

      {statement ? (
        <dl className="divide-y divide-line">
          <div className={row}>
            <dt className="text-muted">Salary expected</dt>
            <dd className="num font-bold text-good">
              <Money sen={statement.salary} />
            </dd>
          </div>
          <div className={row}>
            <dt className="text-muted">Bills from {spendingName ?? "your spending account"}</dt>
            <dd className="num font-bold">
              <span aria-hidden>−</span>
              <span className="sr-only">minus </span>
              <Money sen={statement.bills} />
            </dd>
          </div>
          <div className={row}>
            <dt className="text-muted">Everyday allowance and buffer</dt>
            <dd className="num font-bold">
              <span aria-hidden>−</span>
              <span className="sr-only">minus </span>
              <Money sen={statement.kept} />
            </dd>
          </div>
          <div className={row}>
            <dt className="font-extrabold">To savings</dt>
            <dd className="num font-extrabold">
              <Money sen={statement.toSavings} />
            </dd>
          </div>
        </dl>
      ) : (
        <p className="sub leading-relaxed">
          Record your salary and choose your spending account first. The plan splits your pay between bills, everyday spending and savings, and needs both to add up.
        </p>
      )}

      {statement && statement.deficit > 0 && (
        <p role="alert" className="banner banner-danger leading-snug">
          Bills, allowance and buffer come to {formatRM(statement.bills + statement.kept)}, which is {formatRM(statement.deficit)} more than the pay. Open
          &quot;Adjust plan&quot; to try a smaller allowance.
        </p>
      )}
      {moved > 0 && (
        <p role="status" className="flex items-center gap-1.5 text-xs font-extrabold text-good">
          <DuoIcon name="check" size={16} aria-hidden /> Already moved {formatRM(moved)} to savings this cycle.
        </p>
      )}

      <details open={salaryOpen} className="group">
        <summary className="btn-primary w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <DuoIcon name="cash" size={18} aria-hidden /> Mark salary received
        </summary>
        <div className="mt-3 space-y-2.5">
          <p className="sub !text-foreground">
            {hasSalary && salaryOpen ? "Payday has arrived? " : ""}Salary landing in your spending account is what starts a pay cycle. Record it and everything on this page lines up with your real month.
          </p>
          <SalaryForm defaultAmount={salaryDefault} today={today} canRecord={canRecordSalary} />
        </div>
      </details>

      {statement && (
        <details className="group">
          <summary className="btn w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden">Adjust plan</summary>
          <div className="mt-3">{planner}</div>
        </details>
      )}
    </section>
  );
}
