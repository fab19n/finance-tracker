import { AlertTriangle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { shortDate } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import type { Cycle } from "@/lib/plan/cycle";
import type { SafeToSpend } from "@/lib/queries/plan";

/**
 * The one number that answers "can I spend this?": what is in the spending account minus the bills it
 * still has to pay before the next payday. When it goes negative, spending is quietly coming out of savings.
 */
export function SafeToSpendCard({ safe, cycle, compact = false }: { safe: SafeToSpend; cycle: Cycle; compact?: boolean }) {
  if (!safe.configured) {
    return (
      <div className="card !p-3.5 text-sm">
        <p className="font-semibold">Safe to spend</p>
        <p className="text-muted">
          Choose which account is your <strong>spending</strong> account (where salary lands and bills are paid) and I&apos;ll show how
          much you can spend before payday.{" "}
          <Link href="/settings" className="font-medium text-accent">
            Set it in Settings
          </Link>
        </p>
      </div>
    );
  }

  const short = safe.safe < 0;
  const Icon = short ? AlertTriangle : ShieldCheck;
  return (
    <section
      className={`card !p-3.5 ${short ? "border-danger/50 bg-danger-soft/40" : "border-accent/30"}`}
      aria-label="Safe to spend"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Icon size={14} className={short ? "text-danger" : "text-accent"} aria-hidden /> Safe to spend until payday
          </p>
          <p className={`mt-1 text-3xl font-semibold tracking-tight ${short ? "text-danger" : ""}`}>
            {short ? "−" : ""}
            {formatRM(Math.abs(safe.safe))}
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          <p className="font-medium text-foreground">
            {cycle.paydayOverdue ? "Payday due" : `${cycle.daysLeft} day${cycle.daysLeft === 1 ? "" : "s"} to payday`}
          </p>
          <p>{shortDate(cycle.nextPayday)}</p>
        </div>
      </div>

      {short ? (
        <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          Your bills need more than {safe.accountName} holds. Anything you spend now is really coming out of savings.
        </p>
      ) : (
        !compact &&
        safe.perDay !== null && (
          <p className="mt-1 text-sm">
            About <strong>{formatRM(safe.perDay)}</strong> a day for everyday things.
          </p>
        )
      )}

      <p className="mt-2 text-xs text-muted">
        {formatRM(safe.balance)} in {safe.accountName} − {formatRM(safe.reserve)} held back for {safe.unpaidCount} unpaid bill
        {safe.unpaidCount === 1 ? "" : "s"}
        {safe.overdueCount > 0 && <span className="font-medium text-danger"> ({safe.overdueCount} overdue)</span>}
      </p>
      {cycle.paydayOverdue && (
        <p className="mt-1 text-xs font-medium text-warn">
          Payday was expected {shortDate(cycle.nextPayday)}. Record your salary on the Plan page to start the new cycle.
        </p>
      )}
    </section>
  );
}
