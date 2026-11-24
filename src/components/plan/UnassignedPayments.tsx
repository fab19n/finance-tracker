import { ChevronDown } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { assignPayment } from "@/app/actions/shares";
import { shortDate } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import type { ShareRow, UnassignedCredit } from "@/lib/queries/shares";

export const UNCLAIMED_SHOWN = 15;
const SHOWN = UNCLAIMED_SHOWN;

/**
 * Money that came in but isn't counted towards anyone yet. When one person fits (their words are on the line) they are
 * preselected, so it is a single tap; otherwise you choose. Anything that isn't a friend's payment you just ignore.
 * `other` is money in that does not look like a payment (an odd amount, an old entry): kept behind "Show all money in" so
 * a real payment of an unusual size can still be counted.
 */
export function UnassignedPayments({ credits, other = [], people }: { credits: UnassignedCredit[]; other?: UnassignedCredit[]; people: ShareRow[] }) {
  const active = people.filter((p) => p.active);
  if ((!credits.length && !other.length) || !active.length) return null;
  const row = (c: UnassignedCredit) => (
    <li key={c.id} className="rounded-2xl bg-card-subtle p-3">
      <ActionForm action={assignPayment} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,14rem)_auto]">
        <input type="hidden" name="txId" value={c.id} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-extrabold">{c.description || "Money in"}</p>
          <p className="text-[11px] font-bold text-muted">{shortDate(c.date)}</p>
        </div>
        <span className="num shrink-0 text-[13px] font-black text-good">+{formatRM(c.amount)}</span>
        <select name="shareId" defaultValue={c.suggestedShareId ?? ""} required className="input col-span-2 min-w-0 md:col-span-1" aria-label={`Who sent ${formatRM(c.amount)} on ${c.date}`}>
          <option value="" disabled>
            From…
          </option>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.billName} · {p.name}
            </option>
          ))}
        </select>
        <SubmitButton className="btn-primary col-span-2 w-full md:col-span-1 md:w-auto" pendingLabel="Counting...">
          {c.suggestedShareId ? "Yes, count it" : "Count it"}
        </SubmitButton>
      </ActionForm>
    </li>
  );
  return (
    <section id="unassigned" className="card scroll-mt-4 space-y-3" aria-labelledby="unassigned-h">
      <div>
        <h2 id="unassigned-h" className="h2">
          Money in, not yet counted
        </h2>
        <p className="sub mt-0.5 leading-relaxed">
          Payments you recorded in Reimbursements always show here. If one was somebody paying their share, say who: it settles their oldest months. Leave the rest alone.
        </p>
      </div>
      {credits.length > 0 ? (
        <ul className="space-y-1.5">{credits.slice(0, SHOWN).map(row)}</ul>
      ) : (
        <p className="sub">Nothing here looks like a payment. If one is missing, open &ldquo;Show all money in&rdquo; below.</p>
      )}
      {credits.length > SHOWN && <p className="sub">Showing the {SHOWN} most recent of {credits.length}.</p>}
      {other.length > 0 && (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-xs font-extrabold text-accent-strong [&::-webkit-details-marker]:hidden">
            Show all money in ({other.length} more)
            <ChevronDown size={14} strokeWidth={2.5} className="transition group-open:rotate-180" aria-hidden />
          </summary>
          <p className="sub mb-2 leading-relaxed">Other money in with an unusual amount or an older date. Count one only if somebody really paid their share with it.</p>
          <ul className="space-y-1.5">{other.slice(0, SHOWN).map(row)}</ul>
          {other.length > SHOWN && <p className="sub mt-1">Showing the {SHOWN} most recent of {other.length}.</p>}
        </details>
      )}
    </section>
  );
}
