import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { shortDate } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import type { Cycle } from "@/lib/plan/cycle";
import type { SafeToSpend } from "@/lib/queries/plan";

/**
 * The one number that answers "can I spend this?": what is in the spending account minus the bills it
 * still has to pay before the next payday. It is the hero card of the page: solid accent. When it goes negative,
 * spending is quietly coming out of savings, and the card turns solid danger (the --hero-danger-* tokens).
 *
 * `compact` is the Add page's version: a smaller amount, with the days to payday, the date and the daily figure
 * tucked into the corner. The full version (Plan) has the room to say it in a line under the amount.
 */
export function SafeToSpendCard({ safe, cycle, compact = false }: { safe: SafeToSpend; cycle: Cycle; compact?: boolean }) {
  if (!safe.configured) {
    return (
      <div className="card">
        <p className="h2">Safe to spend</p>
        <p className="sub mt-1 leading-relaxed">
          Choose which account is your <strong className="text-foreground">spending</strong> account (where salary lands and bills are paid) and I&apos;ll show how
          much you can spend before payday.{" "}
          <Link href="/settings?tab=accounts" className="font-extrabold text-accent-strong underline-offset-2 hover:underline">
            Set it in Settings
          </Link>
        </p>
      </div>
    );
  }

  const short = safe.safe < 0;
  const days = cycle.paydayOverdue ? "Payday due" : `${cycle.daysLeft} day${cycle.daysLeft === 1 ? "" : "s"} to payday`;
  const amount = (
    <p className={`num font-black leading-none tracking-[-0.03em] ${compact ? "text-[38px]" : "text-[44px]"}`}>
      {short ? "−" : ""}
      {formatRM(Math.abs(safe.safe))}
    </p>
  );
  const shortMessage = (
    <p className="mt-3 text-[13px] font-extrabold">
      Your bills need more than {safe.accountName} holds. Anything you spend now is really coming out of savings.
    </p>
  );
  return (
    <section className={short ? "hero-danger" : "hero"} aria-label="Safe to spend">
      <p className="flex items-center gap-1.5 text-xs font-extrabold">
        {short && <AlertTriangle size={14} aria-hidden />} Safe to spend until payday
      </p>

      {compact ? (
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5">
          {amount}
          <div className="ml-auto shrink-0 text-right">
            <p className="text-xs font-extrabold">{days}</p>
            <p className="whitespace-nowrap text-[11px] font-bold">
              {shortDate(cycle.nextPayday)}
              {!short && safe.perDay !== null && ` · ${formatRM(safe.perDay)} a day`}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-1.5">{amount}</div>
      )}

      {short ? (
        shortMessage
      ) : (
        !compact && (
          <p className="mt-2.5 text-[13px] font-extrabold">
            {days}
            {safe.perDay !== null && (
              <>
                {" "}
                · About {formatRM(safe.perDay)} a day for everyday things.
              </>
            )}
          </p>
        )
      )}

      <p className="mt-2.5 text-[11px] font-bold">
        {formatRM(safe.balance)} in {safe.accountName} − {formatRM(safe.reserve)} held back for {safe.unpaidCount} unpaid bill
        {safe.unpaidCount === 1 ? "" : "s"}
        {safe.overdueCount > 0 && <span className="font-black"> ({safe.overdueCount} overdue)</span>}
      </p>
      {cycle.paydayOverdue && (
        <p className="banner banner-warn mt-3 !py-2 text-xs">
          Payday was expected {shortDate(cycle.nextPayday)}. Record your salary on the Plan page to start the new cycle.
        </p>
      )}
    </section>
  );
}
