import { assignPayment } from "@/app/actions/shares";
import { shortDate } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import type { ShareRow, UnassignedCredit } from "@/lib/queries/shares";

const SHOWN = 15;

/**
 * Money that came in but isn't counted towards anyone yet. When one person fits (their words are on the line) they are
 * preselected, so it is a single tap; otherwise you choose. Anything that isn't a friend's payment you just ignore.
 */
export function UnassignedPayments({ credits, people }: { credits: UnassignedCredit[]; people: ShareRow[] }) {
  const active = people.filter((p) => p.active);
  if (!credits.length || !active.length) return null;
  return (
    <section className="card space-y-3" aria-labelledby="unassigned-h">
      <div>
        <h2 id="unassigned-h" className="font-semibold">
          Money in, not yet counted towards anyone
        </h2>
        <p className="text-xs text-muted">
          If one of these was somebody paying their share, say who. It then counts towards their oldest unpaid months. Leave the rest alone.
        </p>
      </div>
      <ul className="divide-y divide-line">
        {credits.slice(0, SHOWN).map((c) => (
          <li key={c.id} className="py-2">
            <form action={assignPayment} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="txId" value={c.id} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.description || "Money in"}</p>
                <p className="text-xs text-muted">{shortDate(c.date)}</p>
              </div>
              <span className="num shrink-0 font-semibold text-income">+{formatRM(c.amount)}</span>
              <select name="shareId" defaultValue={c.suggestedShareId ?? ""} required className="input !py-2 text-sm" aria-label={`Who sent ${formatRM(c.amount)} on ${c.date}`}>
                <option value="" disabled>
                  From…
                </option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.billName} · {p.name}
                  </option>
                ))}
              </select>
              <button className="btn !py-2 text-sm">{c.suggestedShareId ? "Yes, count it" : "Count it"}</button>
            </form>
          </li>
        ))}
      </ul>
      {credits.length > SHOWN && <p className="text-xs text-muted">Showing the {SHOWN} most recent of {credits.length}.</p>}
    </section>
  );
}
