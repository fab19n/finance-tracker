import { PiggyBank } from "lucide-react";
import Link from "next/link";
import { Meter } from "@/components/Meter";
import type { SavingsOpportunity } from "@/lib/investing/idle";
import { formatRM, formatRMWhole } from "@/lib/money";

/** What the savings account holds, what it earns, and how much of it could work harder without losing safety. */
export function IdleSavingsCard({
  op,
  accountName,
  savingsRatePct,
  fdRatePct,
}: {
  op: SavingsOpportunity;
  accountName: string;
  savingsRatePct: number;
  fdRatePct: number;
}) {
  const used = op.goal > 0 ? op.balance / op.goal : 1;
  return (
    <section className="card space-y-4" aria-labelledby="idle-h">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="idle-h" className="flex items-center gap-2 font-semibold">
            <PiggyBank size={18} className="text-accent" aria-hidden /> Your savings: {accountName}
          </h2>
          <p className="text-sm text-muted">
            Earning {savingsRatePct}% now, about <strong className="text-foreground">{formatRM(op.earnsNow)}</strong> a year.
          </p>
        </div>
        <p className="text-right text-2xl font-semibold tracking-tight">{formatRM(op.balance)}</p>
      </div>

      {op.monthlyCosts > 0 ? (
        <>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span>
                Covers <strong>{op.monthsCovered.toFixed(1)} months</strong> of your costs ({formatRM(op.monthlyCosts)}/month)
              </span>
              <span className="text-xs text-muted">goal {op.targetMonths} months = {formatRMWhole(op.goal)}</span>
            </div>
            <Meter used={used} status={op.funded ? "ok" : used >= 0.5 ? "watch" : "over"} />
          </div>

          <ul className="space-y-2 text-sm">
            <li className="flex gap-2">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-series-1" aria-hidden />
              <span>
                <strong>{formatRM(op.instant)}</strong> stays in the account, instantly reachable: about one month of costs, for a true emergency.
              </span>
            </li>
            {op.parkable > 0 && (
              <li className="flex gap-2">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-series-3" aria-hidden />
                <span>
                  <strong>{formatRM(op.parkable)}</strong> is the rest of your emergency fund. It must stay safe, but it needn&apos;t be reachable in minutes: a fixed deposit or money-market fund you
                  can break or redeem within days can pay more.
                </span>
              </li>
            )}
            {op.excess > 0 && (
              <li className="flex gap-2">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-series-2" aria-hidden />
                <span>
                  <strong>{formatRM(op.excess)}</strong> is above your {op.targetMonths}-month goal: that&apos;s genuinely extra money. The advisor below shows what to do with it.
                </span>
              </li>
            )}
          </ul>

          {op.noGain ? (
            <p className="rounded-xl bg-background px-3 py-2.5 text-sm text-muted">
              At your assumed rates ({savingsRatePct}% savings vs {fdRatePct}% fixed deposit) there&apos;s nothing to gain by moving it. Check current rates and update them in{" "}
              <Link href="/settings" className="font-medium text-accent">
                Settings
              </Link>
              .
            </p>
          ) : op.extraPerYear > 0 ? (
            <p className="rounded-xl bg-accent-soft px-3 py-2.5 text-sm text-accent">
              At {fdRatePct}% instead of {savingsRatePct}%, the part that can move would earn about <strong>{formatRM(op.extraPerYear)} more a year</strong>, for the same safety. Rates are your
              assumptions: check what your bank really pays, and its early-withdrawal terms.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">Add your bills on the Plan page so I can work out how many months of costs this covers.</p>
      )}
    </section>
  );
}
