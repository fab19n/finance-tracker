import { CheckCircle2, Info } from "lucide-react";
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
      <div>
        <h2 id="idle-h" className="sub">
          Your savings: {accountName}
        </h2>
        <p className="num mt-0.5 break-words text-[32px] font-black leading-tight tracking-[-0.03em]">{formatRM(op.balance)}</p>
        <p className="mt-1 text-[13px] font-bold">
          Earning {savingsRatePct}% now, about <strong className="font-black">{formatRM(op.earnsNow)}</strong> a year.
        </p>
      </div>

      {op.monthlyCosts > 0 ? (
        <>
          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs font-extrabold">
              <span>
                Covers <strong className="font-black">{op.monthsCovered.toFixed(1)} months</strong> of your costs ({formatRM(op.monthlyCosts)}/month)
              </span>
              <span className="font-bold text-muted">
                goal {op.targetMonths} months = {formatRMWhole(op.goal)}
              </span>
            </div>
            <Meter used={used} status={op.funded ? "ok" : used >= 0.5 ? "watch" : "over"} />
          </div>

          <ul className="space-y-2.5 rounded-2xl bg-card-subtle p-3.5 text-xs font-bold leading-relaxed">
            <li className="flex gap-2.5">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-series-1" aria-hidden />
              <span>
                <strong className="font-black">{formatRM(op.instant)}</strong> stays in the account, instantly reachable: about one month of costs, for a true emergency.
              </span>
            </li>
            {op.parkable > 0 && (
              <li className="flex gap-2.5">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-series-3" aria-hidden />
                <span>
                  <strong className="font-black">{formatRM(op.parkable)}</strong> is the rest of your emergency fund. It must stay safe, but it needn&apos;t be reachable in minutes: a
                  fixed deposit or money-market fund you can break or redeem within days can pay more.
                </span>
              </li>
            )}
            {op.excess > 0 && (
              <li className="flex gap-2.5">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-series-2" aria-hidden />
                <span>
                  <strong className="font-black">{formatRM(op.excess)}</strong> is above your {op.targetMonths}-month goal: that&apos;s genuinely extra money. The advisor below
                  shows what to do with it.
                </span>
              </li>
            )}
          </ul>

          {op.noGain ? (
            <p className="banner bg-card-subtle !text-xs leading-relaxed text-muted">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                At your assumed rates ({savingsRatePct}% savings vs {fdRatePct}% fixed deposit) there&apos;s nothing to gain by moving it. Check current rates and update them
                in{" "}
                <Link href="/settings" className="font-extrabold text-accent-strong underline-offset-2 hover:underline">
                  Settings
                </Link>
                .
              </span>
            </p>
          ) : op.extraPerYear > 0 ? (
            <p className="banner banner-good !text-xs leading-relaxed">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                At {fdRatePct}% instead of {savingsRatePct}%, the part that can move would earn about <strong className="font-black">{formatRM(op.extraPerYear)} more a year</strong>,
                for the same safety. Rates are your assumptions: check what your bank really pays, and its early-withdrawal terms.
              </span>
            </p>
          ) : null}
        </>
      ) : (
        <p className="sub leading-relaxed">Add your bills on the Plan page so I can work out how many months of costs this covers.</p>
      )}
    </section>
  );
}
