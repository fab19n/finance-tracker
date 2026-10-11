import { AlertTriangle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { shortDate } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import type { Cycle } from "@/lib/plan/cycle";
import type { SafeToSpend } from "@/lib/queries/plan";

/**
 * The one number that answers "can I spend this?": what is in the spending account minus the bills it
 * still has to pay before the next payday. When it goes negative, spending is quietly coming out of savings,
 * and the card turns danger-toned (the --hero-danger-* tokens).
 *
 * `compact` is the phone's version above the Add form: it leaves out the "about RM X a day" line (which a
 * desktop shows, since the card has the room there).
 */
export function SafeToSpendCard({ safe, cycle, compact = false }: { safe: SafeToSpend; cycle: Cycle; compact?: boolean }) {
  if (!safe.configured) {
    return (
      <div className="card text-sm">
        <p className="font-semibold">Safe to spend</p>
        <p className="mt-0.5 text-muted">
          Choose which account is your <strong className="text-foreground">spending</strong> account (where salary lands and bills are paid) and I&apos;ll show how
          much you can spend before payday.{" "}
          <Link href="/settings?tab=accounts" className="font-semibold text-accent underline-offset-2 hover:underline">
            Set it in Settings
          </Link>
        </p>
      </div>
    );
  }

  const short = safe.safe < 0;
  const Icon = short ? AlertTriangle : ShieldCheck;
  // The card's own secondary text colour, by variant.
  const secondary = short ? "text-hero-danger-secondary" : "text-hero-secondary";
  return (
    <section className={short ? "hero-danger" : "hero"} aria-label="Safe to spend">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] ${secondary}`}>
            <Icon size={14} aria-hidden /> Safe to spend until payday
          </p>
          <p className="num mt-1.5 text-[34px] font-extrabold leading-none tracking-[-0.04em] md:text-[38px]">
            {short ? "−" : ""}
            {formatRM(Math.abs(safe.safe))}
          </p>
        </div>
        <div className={`shrink-0 text-right text-xs ${secondary}`}>
          <p className="text-sm font-bold text-current">
            {cycle.paydayOverdue ? "Payday due" : `${cycle.daysLeft} day${cycle.daysLeft === 1 ? "" : "s"} to payday`}
          </p>
          <p>{shortDate(cycle.nextPayday)}</p>
        </div>
      </div>

      {short ? (
        <p className="mt-3 text-sm font-semibold">
          Your bills need more than {safe.accountName} holds. Anything you spend now is really coming out of savings.
        </p>
      ) : (
        safe.perDay !== null && (
          <p className={`mt-2 text-sm ${secondary} ${compact ? "hidden md:block" : ""}`}>
            About <strong className="text-current">{formatRM(safe.perDay)}</strong> a day for everyday things.
          </p>
        )
      )}

      <p className={`mt-2.5 text-xs ${secondary}`}>
        {formatRM(safe.balance)} in {safe.accountName} − {formatRM(safe.reserve)} held back for {safe.unpaidCount} unpaid bill
        {safe.unpaidCount === 1 ? "" : "s"}
        {safe.overdueCount > 0 && <span className={`font-semibold ${short ? "" : "text-danger"}`}> ({safe.overdueCount} overdue)</span>}
      </p>
      {cycle.paydayOverdue && (
        <p className="banner banner-warn mt-3 !py-2 text-xs font-medium">
          Payday was expected {shortDate(cycle.nextPayday)}. Record your salary on the Plan page to start the new cycle.
        </p>
      )}
    </section>
  );
}
