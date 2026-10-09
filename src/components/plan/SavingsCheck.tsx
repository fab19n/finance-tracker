import { formatPct, formatRM } from "@/lib/money";
import { cycleLabel } from "@/lib/plan/cycle";
import type { CycleFlow } from "@/lib/plan/savings-flow";

/**
 * The reality check. For each pay cycle: what went into savings, what came back out, why, and what you
 * REALLY saved - because moving money between your own accounts is not spending, and hides where it went.
 */
export function SavingsCheck({ flows, rolesConfigured, hasSalary }: { flows: CycleFlow[]; rolesConfigured: boolean; hasSalary: boolean }) {
  if (!rolesConfigured) {
    return <p className="card text-sm text-muted">Choose your spending and savings accounts in Settings, and this shows how much of what you &quot;save&quot; really stays saved.</p>;
  }
  if (!hasSalary || flows.length === 0) {
    return <p className="card text-sm text-muted">Record your salary (above) and a few entries, and this compares what you move to savings with what you take back out each cycle.</p>;
  }

  // Lead with the latest finished cycle; fall back to the one in progress.
  const lead = flows.find((f) => f.complete) ?? flows[0];
  const hasMovement = lead.deposited > 0 || lead.drawn > 0 || lead.spentFromSavings > 0;
  // What actually stayed in savings out of what you moved there.
  const kept = lead.deposited - lead.drawn - lead.spentFromSavings;

  return (
    <div className="space-y-3">
      <div className="card space-y-2 text-sm">
        <p className="text-xs font-medium text-muted">
          {lead.complete ? "Last cycle" : "This cycle so far"} · {cycleLabel(lead)}
        </p>
        {!hasMovement ? (
          <p>No transfers between your spending and savings accounts recorded in this cycle yet.</p>
        ) : (
          <>
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
            <p className="rounded-xl bg-accent-soft px-3 py-2 font-medium text-accent">
              What you really saved: {formatRM(lead.trueSaved)}
              {lead.trueRate !== null ? ` (${formatPct(lead.trueRate)} of your income)` : ""}
              {lead.deposited > 0 && lead.trueSaved < lead.deposited ? `, not the ${formatRM(lead.deposited)} you moved` : ""}.
            </p>
          </>
        )}
      </div>

      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Savings by pay cycle</caption>
          <thead className="text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Cycle</th>
              <th className="px-3 py-2 text-right font-medium">Income</th>
              <th className="px-3 py-2 text-right font-medium">To savings</th>
              <th className="px-3 py-2 text-right font-medium">Taken back</th>
              <th className="px-3 py-2 text-right font-medium">Paid from savings</th>
              <th className="px-3 py-2 text-right font-medium">Everyday</th>
              <th className="px-3 py-2 text-right font-medium">Really saved</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {flows.map((f) => (
              <tr key={f.start}>
                <td className="px-3 py-2">
                  {cycleLabel(f)}
                  {!f.complete && <span className="pill ml-1.5 bg-background text-muted">in progress</span>}
                </td>
                <td className="num px-3 py-2 text-right">{formatRM(f.income)}</td>
                <td className="num px-3 py-2 text-right">{formatRM(f.deposited)}</td>
                <td className="num px-3 py-2 text-right">{formatRM(f.drawn)}</td>
                <td className="num px-3 py-2 text-right">{formatRM(f.spentFromSavings)}</td>
                <td className="num px-3 py-2 text-right">{formatRM(f.variable)}</td>
                <td className={`num px-3 py-2 text-right font-semibold ${f.trueSaved < 0 ? "text-danger" : ""}`}>{formatRM(f.trueSaved)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
