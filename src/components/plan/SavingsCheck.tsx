import Link from "next/link";
import { formatPct, formatRM } from "@/lib/money";
import { cycleLabel } from "@/lib/plan/cycle";
import type { CycleFlow } from "@/lib/plan/savings-flow";
import { savingsSummary } from "@/lib/plan/statement";

/**
 * The savings check, as the board draws it: one sentence ("You planned RM 800 and moved RM 800. Nothing was drawn back
 * out this cycle.") and a bar of how much of the plan was moved. The reality check's full reading (what came back, why, what
 * you REALLY saved, every cycle) is behind "Details": moving money between your own accounts is not spending, and hides where
 * it went. `planned` is the payday plan's move for the cycle in progress (null when no plan can be made yet).
 */
export function SavingsCheck({ flows, rolesConfigured, hasSalary, planned }: { flows: CycleFlow[]; rolesConfigured: boolean; hasSalary: boolean; planned: number | null }) {
  if (!rolesConfigured) {
    return (
      <p className="card sub leading-relaxed">
        <span className="label">Savings check</span>
        Choose your spending and savings accounts in{" "}
        <Link href="/settings?tab=accounts" className="font-extrabold text-accent-strong underline-offset-2 hover:underline">
          Settings
        </Link>
        , and this shows how much of what you &quot;save&quot; really stays saved.
      </p>
    );
  }
  if (!hasSalary || flows.length === 0) {
    return (
      <p className="card sub leading-relaxed">
        <span className="label">Savings check</span>
        Record your salary (&quot;Mark salary received&quot; above) and a few entries, and this compares what you move to savings with what you take back out each cycle.
      </p>
    );
  }
  // The headline is about the cycle in progress (the newest), the one the plan was made for.
  const head = savingsSummary(flows[0], planned);
  const pct = head.fraction === null ? null : Math.round(head.fraction * 100);

  // Lead with the latest finished cycle; fall back to the one in progress.
  const lead = flows.find((f) => f.complete) ?? flows[0];
  const hasMovement = lead.deposited > 0 || lead.drawn > 0 || lead.spentFromSavings > 0;
  // What actually stayed in savings out of what you moved there.
  const kept = lead.deposited - lead.drawn - lead.spentFromSavings;

  return (
    <section className="card space-y-3" aria-labelledby="check-h">
      <h2 id="check-h" className="label !mb-0">
        Savings check
      </h2>
      <p className="text-[13.5px] font-semibold leading-snug">{head.text}</p>
      {pct !== null && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-card-subtle" role="img" aria-label={`${pct}% of the planned move to savings has been moved`}>
          <div className="h-full rounded-full bg-good" style={{ width: `${pct}%` }} />
        </div>
      )}
      <details>
        <summary className="btn btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">Details</summary>
        <div className="mt-3 space-y-3">
      <div className="space-y-3">
        <p className="sub">
          {lead.complete ? "Last cycle" : "This cycle so far"} · {cycleLabel(lead)}
        </p>
        {!hasMovement ? (
          <p className="text-[13px] font-semibold">No transfers between your spending and savings accounts recorded in this cycle yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-card-subtle p-3">
                <p className="label !mb-0.5">Moved</p>
                <p className="num text-sm font-black">{formatRM(lead.deposited)}</p>
              </div>
              <div className="rounded-2xl bg-card-subtle p-3">
                <p className="label !mb-0.5">Came back</p>
                <p className="num text-sm font-black text-danger">{formatRM(lead.drawn)}</p>
              </div>
              <div className="rounded-2xl bg-good-soft p-3">
                <p className="label !mb-0.5 !text-good">Really saved</p>
                <p className="num text-sm font-black text-good">{formatRM(lead.trueSaved)}</p>
              </div>
            </div>
            <div className="space-y-2 text-[13px] font-semibold leading-snug">
              <p>
                You moved <strong>{formatRM(lead.deposited)}</strong> to savings and took <strong>{formatRM(lead.drawn)}</strong> back out.
              </p>
              {lead.planningGap > 0 && (
                <p>
                  <strong className="text-warn">{formatRM(lead.planningGap)}</strong> of that was <strong>built into your payday split</strong>: only{" "}
                  {formatRM(Math.max(0, lead.leftAfterDeposit))} stayed behind, but the bills paid from that account came to {formatRM(lead.billsFromSpending)}. Fixable by moving less at payday.
                </p>
              )}
              {lead.spentFromSavings > 0 && (
                <p>
                  <strong className="text-danger">{formatRM(lead.spentFromSavings)}</strong> was <strong>paid straight out of savings</strong>
                  {lead.savingsSpendTop.length > 0 ? ` (${lead.savingsSpendTop.map((t) => `${t.name} ${formatRM(t.amount)}`).join(", ")})` : ""}, never touching your spending account.{" "}
                  {kept >= 0 ? (
                    <>
                      So about <strong>{formatRM(kept)}</strong> of the {formatRM(lead.deposited)} you moved actually stayed there.
                    </>
                  ) : (
                    <>
                      So savings went <strong className="text-danger">down by {formatRM(-kept)}</strong> even though you moved {formatRM(lead.deposited)} in.
                    </>
                  )}
                </p>
              )}
              {lead.everydayFromSavings > 0 && (
                <p>
                  <strong className="text-danger">{formatRM(lead.everydayFromSavings)}</strong> more came out because <strong>everyday spending</strong> (
                  {formatRM(lead.variable)}) ran past what was left. That&apos;s the leak to watch.
                </p>
              )}
            </div>
            <p className="banner banner-good font-extrabold">
              What you really saved: {formatRM(lead.trueSaved)}
              {lead.trueRate !== null ? ` (${formatPct(lead.trueRate)} of your income)` : ""}
              {lead.deposited > 0 && lead.trueSaved < lead.deposited ? `, not the ${formatRM(lead.deposited)} you moved` : ""}.
            </p>
          </>
        )}
      </div>

      {/* Seven columns do not fit a phone: the card scrolls sideways, can be focused and scrolled from the keyboard, and says so. */}
      <div
        className="overflow-x-auto rounded-2xl border border-line"
        role="region"
        tabIndex={0}
        aria-label="Savings by pay cycle. Scrolls sideways on a small screen; use the arrow keys."
      >
        <table className="w-full min-w-[40rem] text-left text-[13px]">
          <caption className="sr-only">Savings by pay cycle</caption>
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="px-3.5 py-3 font-extrabold">Cycle</th>
              <th scope="col" className="px-3 py-3 text-right font-extrabold">Really saved</th>
              <th scope="col" className="px-3 py-3 text-right font-extrabold">Income</th>
              <th scope="col" className="px-3 py-3 text-right font-extrabold">To savings</th>
              <th scope="col" className="px-3 py-3 text-right font-extrabold">Taken back</th>
              <th scope="col" className="px-3 py-3 text-right font-extrabold">Paid from savings</th>
              <th scope="col" className="px-3.5 py-3 text-right font-extrabold">Everyday</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {flows.map((f) => (
              <tr key={f.start} className="font-bold">
                <th scope="row" className="px-3.5 py-2.5 text-left font-bold">
                  {cycleLabel(f)}
                  {!f.complete && <span className="pill ml-1.5 bg-card-subtle text-muted">in progress</span>}
                </th>
                <td className={`num px-3 py-2.5 text-right font-black ${f.trueSaved < 0 ? "text-danger" : "text-good"}`}>
                  {formatRM(f.trueSaved)}
                </td>
                <td className="num px-3 py-2.5 text-right">{formatRM(f.income)}</td>
                <td className="num px-3 py-2.5 text-right">{formatRM(f.deposited)}</td>
                <td className="num px-3 py-2.5 text-right">{formatRM(f.drawn)}</td>
                <td className="num px-3 py-2.5 text-right">{formatRM(f.spentFromSavings)}</td>
                <td className="num px-3.5 py-2.5 text-right">{formatRM(f.variable)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        </div>
      </details>
    </section>
  );
}
