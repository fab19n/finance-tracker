import { AlertTriangle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { shortDate } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import type { Cycle } from "@/lib/plan/cycle";
import type { SafeToSpend } from "@/lib/queries/plan";

/**
 * The one number that answers "can I spend this?": what is in the spending account minus the bills it
 * still has to pay before the next payday. It is the hero card of the page: a gold rim and a gold figure. When it goes
 * negative, spending is quietly coming out of savings, and the rim and figure turn danger (the --hero-danger-* tokens).
 *
 * `compact` is the Add page's version, and it is not a card at all: one quiet line (shield, "Left to spend RM x", the days
 * to payday on the right), as drawn on the Entry board. The full version (Plan) keeps the coin-rim card.
 */
export function SafeToSpendCard({ safe, cycle, compact = false }: { safe: SafeToSpend; cycle: Cycle; compact?: boolean }) {
  if (!safe.configured && compact) {
    return (
      <p className="flex items-center gap-2 text-xs font-semibold text-muted">
        <ShieldCheck size={16} aria-hidden className="shrink-0" />
        <span>
          Choose your spending account to see what is safe to spend.{" "}
          <Link href="/settings?tab=accounts" className="font-extrabold text-accent-strong underline">
            Set it in Settings
          </Link>
        </span>
      </p>
    );
  }
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

  if (compact) {
    return (
      <section aria-label="Safe to spend" className="flex items-center gap-2 text-xs font-semibold text-muted">
        {short ? <AlertTriangle size={16} aria-hidden className="shrink-0 text-danger" /> : <ShieldCheck size={16} aria-hidden className="shrink-0" />}
        <span className="min-w-0">
          Safe to spend{" "}
          <b className={`num font-extrabold ${short ? "text-danger" : "text-foreground"}`}>
            {short ? "−" : ""}
            {formatRM(Math.abs(safe.safe))}
          </b>
          {short && <span className="font-extrabold text-danger"> (short)</span>}
        </span>
        <span className="ml-auto shrink-0 whitespace-nowrap">{days}</span>
      </section>
    );
  }

  const amount = (
    <p className="num text-[44px] font-black leading-none tracking-[-0.03em]">
      {short ? "−" : ""}
      {formatRM(Math.abs(safe.safe))}
    </p>
  );
  return (
    <section className={short ? "hero-danger" : "hero"} aria-label="Safe to spend">
      <p className="flex items-center gap-1.5 text-xs font-extrabold">
        {short && <AlertTriangle size={14} aria-hidden />} Safe to spend until payday
      </p>

      <div className="mt-1.5">{amount}</div>

      {short ? (
        <p className="mt-3 text-[13px] font-extrabold">
          Your bills need more than {safe.accountName} holds. Anything you spend now is really coming out of savings.
        </p>
      ) : (
        <p className="mt-2.5 text-[13px] font-extrabold">
          {days}
          {safe.perDay !== null && (
            <>
              {" "}
              · About {formatRM(safe.perDay)} a day for everyday things.
            </>
          )}
        </p>
      )}

      <p className="mt-2.5 text-[11px] font-bold">
        {formatRM(safe.balance)} in {safe.accountName} − {formatRM(safe.reserve)} held back for {safe.unpaidCount} unpaid bill
        {safe.unpaidCount === 1 ? "" : "s"}
        {safe.overdueCount > 0 && <span className="font-black"> ({safe.overdueCount} overdue)</span>}
      </p>
      {cycle.paydayOverdue && (
        <p className="banner banner-warn mt-3 !py-2 text-xs">
          Payday was expected {shortDate(cycle.nextPayday)}. Record your salary in the box above to start the new cycle.
        </p>
      )}
    </section>
  );
}
