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
        <h2 id="unassigned-h" className="h2">
          Money in, not yet counted towards anyone
        </h2>
        <p className="sub mt-0.5 leading-relaxed">
          If one of these was somebody paying their share, say who. It then counts towards their oldest unpaid months. Leave the rest alone.
        </p>
      </div>
      <ul className="space-y-1.5">
        {credits.slice(0, SHOWN).map((c) => (
          <li key={c.id} className="rounded-2xl bg-card-subtle p-3">
            <form action={assignPayment} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,14rem)_auto]">
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
              <button className="btn col-span-2 md:col-span-1">{c.suggestedShareId ? "Yes, count it" : "Count it"}</button>
            </form>
          </li>
        ))}
      </ul>
      {credits.length > SHOWN && <p className="sub">Showing the {SHOWN} most recent of {credits.length}.</p>}
    </section>
  );
}
