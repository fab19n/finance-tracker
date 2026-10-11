import { Check, Circle, X } from "lucide-react";
import { coverMonth, saveTurns } from "@/app/actions/shares";
import { dayLabel, shiftMonth, shortMonthLabel } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { monthRange, rotationWindow, type TurnCell, type TurnPerson } from "@/lib/plan/shares";
import type { ShareRow, SharedBillView } from "@/lib/queries/shares";
import { ShareForm } from "./ShareForm";
import { SharingToggle } from "./SharingToggle";

/** "Oct 26", "Nov 26 to Feb 27", or "Oct 26, Dec 26" for months that aren't back to back. */
function monthSpan(months: string[]): string {
  if (months.length === 0) return "";
  if (months.length === 1) return shortMonthLabel(months[0]);
  const consecutive = months.every((m, i) => i === 0 || shiftMonth(months[i - 1], 1) === m);
  return consecutive ? `${shortMonthLabel(months[0])} to ${shortMonthLabel(months[months.length - 1])}` : months.map(shortMonthLabel).join(", ");
}

/** One line that says where this person stands. */
function standing(p: TurnPerson, thisMonth: string, cycle: string[]): { text: string; tone: "ok" | "owes" | "info" } {
  if (p.owes > 0) {
    const first = p.turns.find((c) => c.month <= thisMonth && c.state !== "paid");
    return { text: `Owes ${formatRM(p.owes)}${first ? ` for ${shortMonthLabel(first.month)}` : ""}`, tone: "owes" };
  }
  if (p.unmatched > 0) return { text: `${formatRM(p.unmatched)} sent, month not set`, tone: "info" };
  if (p.next) return { text: `Paid up · next turn ${shortMonthLabel(p.next.month)}`, tone: "ok" };
  // The group chat's list for a cycle has one line per person, filled in once they have covered a month.
  return p.turns.some((c) => cycle.includes(c.month)) ? { text: "Covered this cycle", tone: "ok" } : { text: "Hasn't covered a month this cycle yet", tone: "info" };
}

/** What happened to one turn, in words. */
function turnLine(c: TurnCell): string {
  const when = c.paidOn.map((d) => dayLabel(d)).join(", ");
  if (c.state === "paid") return `paid ${when}${c.short > 0 ? ` (${formatRM(c.short)} short, counted as paid)` : ""}`;
  if (c.state === "part") return `${formatRM(c.paid)} of ${formatRM(c.due)} paid (${when})`;
  if (c.state === "due") return "not paid yet";
  return "coming up";
}

function Mark({ cell, name, month }: { cell: TurnCell | undefined; name: string; month: string }) {
  if (!cell) return <td className="px-1 py-1 text-center text-muted/40" aria-label={`${name}, ${shortMonthLabel(month)}: not their turn`}>·</td>;
  // Never colour alone: each state has its own mark and a text label.
  const label = `${name}, ${shortMonthLabel(month)}: ${turnLine(cell)}`;
  if (cell.state === "paid")
    return (
      <td className="px-1 py-1 text-center text-accent" title={label}>
        <Check size={14} className="inline" aria-label={label} />
      </td>
    );
  if (cell.state === "part")
    return (
      <td className="px-1 py-1 text-center font-semibold text-warn" title={label}>
        <span aria-label={label}>½</span>
      </td>
    );
  if (cell.state === "due")
    return (
      <td className="px-1 py-1 text-center text-danger" title={label}>
        <X size={14} className="inline" aria-label={label} />
      </td>
    );
  return (
    <td className="px-1 py-1 text-center text-muted" title={label}>
      <Circle size={12} className="inline" aria-label={label} />
    </td>
  );
}

/**
 * A bill paid in turns (Spotify): one person covers the whole month, and you take the first month of each cycle. Months
 * are not assigned in a fixed order: whoever says they will cover a month gets it, so a month is OPEN until then. Shows
 * your two latest cycles as a checklist (a mark only in the months that are THEIRS), who owes you for a month they
 * covered, and, for money that has arrived for a month nobody has been given yet, a one-tap "which month?".
 */
export function RotationCard({ view, people, bills, defaultStart, today }: { view: SharedBillView; people: ShareRow[]; bills: { id: number; name: string }[]; defaultStart: string; today: string }) {
  const r = view.rotation!;
  const thisMonth = today.slice(0, 7);
  const columns = rotationWindow(r.schedule, thisMonth);
  const cycle = columns.slice(-6); // the window ends with the current cycle
  const whoIn = (month: string) => r.schedule.find((s) => s.month === month)?.who;
  const nameOf = (id: number) => r.people.find((p) => p.share.id === id)?.share.name ?? "?";
  const open = cycle.filter((m) => whoIn(m) === undefined);
  const openPast = open.filter((m) => m <= thisMonth);
  const openLater = open.filter((m) => m > thisMonth);
  const mine = people.filter((p) => p.billId === view.bill.id);
  const claims = r.people.flatMap((p) => p.leftovers.map((l) => ({ person: p, ...l })));

  // The planner lists every month that matters: from the earliest planned (or shown) to six months past the window.
  const editorFrom = [...r.schedule.map((s) => s.month), columns[0]].sort()[0];
  const editorMonths = monthRange(editorFrom, shiftMonth(columns[columns.length - 1], 6));

  return (
    <section className="card space-y-4" aria-label={`${view.bill.name}, paid in turns`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">{view.bill.name}</h2>
        <p className="num text-sm text-muted">
          {formatRM(view.bill.amount)} a month · <strong className="text-foreground">one person pays the whole month</strong>, in turn
        </p>
      </div>

      <div className="space-y-2">
        <p className={`rounded-xl px-3 py-2 text-sm font-medium ${r.owedToYou > 0 ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"}`}>
          {r.owedToYou > 0 ? (
            <>
              Owed to you: {formatRM(r.owedToYou)}
              <span className="font-normal"> · {r.dueNow.map((d) => `${shortMonthLabel(d.month)} ${nameOf(d.shareId)}${d.amount < view.bill.amount ? ` (${formatRM(d.amount)})` : ""}`).join(", ")}</span>
            </>
          ) : (
            "Nobody owes you for a month they covered."
          )}
        </p>
        {openPast.length > 0 && (
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
            <strong>{monthSpan(openPast)}</strong> {openPast.length === 1 ? "is" : "are"} still open: nobody has said they&apos;ll cover {openPast.length === 1 ? "it" : "them"} yet.
            {openLater.length > 0 && <span className="text-muted"> {monthSpan(openLater)} stay open too: whoever covers a month gets it.</span>}
          </p>
        )}
        {openPast.length === 0 && openLater.length > 0 && (
          <p className="rounded-xl bg-background px-3 py-2 text-sm text-muted">
            Open: {monthSpan(openLater)}. Whoever says they&apos;ll cover a month gets it.
          </p>
        )}
        {claims.map((c) => (
          <form key={c.txId} action={coverMonth} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
            <input type="hidden" name="billId" value={view.bill.id} />
            <input type="hidden" name="shareId" value={c.person.share.id} />
            <span className="min-w-0 flex-1">
              <strong>{c.person.share.name}</strong> sent {formatRM(c.amount)} on {dayLabel(c.date)}. <span className="text-muted">Which month did they cover?</span>
            </span>
            {open.length > 0 ? (
              <>
                <select name="month" defaultValue={open[0]} className="input !py-1.5 text-sm" aria-label={`Month ${c.person.share.name} covered`}>
                  {open.map((m) => (
                    <option key={m} value={m}>
                      {shortMonthLabel(m)}
                    </option>
                  ))}
                </select>
                <button className="btn !py-1.5 text-sm">Count it</button>
              </>
            ) : (
              <span className="text-xs text-muted">No month is open this cycle: set it in the planner below.</span>
            )}
          </form>
        ))}
      </div>

      <ul className="divide-y divide-line">
        {r.people.map((p) => {
          const s = standing(p, thisMonth, cycle);
          const person = mine.find((m) => m.id === p.share.id);
          return (
            <li key={p.share.id} className="py-2">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="font-medium">
                    {p.share.name}
                    {!p.share.active && <span className="pill ml-1.5 bg-background text-muted">left</span>}
                    <span className="ml-2 text-xs font-normal text-muted">{formatRM(p.share.share)} per turn</span>
                  </span>
                  <span className={`text-sm font-medium ${s.tone === "owes" ? "text-warn" : s.tone === "ok" ? "text-muted" : "text-foreground"}`}>{s.text}</span>
                </summary>
                <div className="mt-2 space-y-3 text-sm">
                  {p.turns.length > 0 ? (
                    <ul className="space-y-0.5 text-muted">
                      {p.turns.map((c) => (
                        <li key={c.month}>
                          <span className="font-medium text-foreground">{shortMonthLabel(c.month)}</span> · {turnLine(c)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted">No month covered yet.</p>
                  )}
                  {p.leftovers.length > 0 && <p className="text-muted">{formatRM(p.unmatched)} they sent isn&apos;t for a month yet: say which month they covered (above, or in the planner).</p>}
                  {p.lastPayment && <p className="text-muted">Last paid {formatRM(p.lastPayment.amount)} on {p.lastPayment.date}.</p>}
                  {person && <ShareForm share={person} bills={bills} defaultStart={defaultStart} />}
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      <div className="overflow-x-auto" tabIndex={0} aria-label="Who covered which month, for your two latest cycles">
        <table className="w-full min-w-[28rem] border-collapse text-xs">
          <caption className="sr-only">Who covers each month, for your two latest cycles</caption>
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">Month</th>
              {columns.map((m) => (
                <th key={m} scope="col" className="px-1 py-1 text-center font-medium">
                  {shortMonthLabel(m).split(" ")[0]}
                  <span className="block text-[11px] font-normal">{m.slice(2, 4)}</span>
                  {whoIn(m) === undefined && <span className="block text-[11px] font-semibold text-warn" title="Open: nobody has covered it yet">?</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line">
              <th scope="row" className="whitespace-nowrap py-1 pr-2 text-left font-medium text-muted">You</th>
              {columns.map((m) =>
                whoIn(m) === "you" ? (
                  <td key={m} className="px-1 py-1 text-center text-[11px] font-medium text-accent" aria-label={`${shortMonthLabel(m)}: your month${r.charged.includes(m) ? ", paid" : ""}`}>
                    you{r.charged.includes(m) && <Check size={11} className="ml-0.5 inline" aria-hidden />}
                  </td>
                ) : (
                  <td key={m} className="px-1 py-1 text-center text-muted/40">·</td>
                ),
              )}
            </tr>
            {r.people.map((p) => (
              <tr key={p.share.id} className="border-t border-line">
                <th scope="row" className="whitespace-nowrap py-1 pr-2 text-left font-medium">
                  {p.share.name}
                </th>
                {columns.map((m) => (
                  <Mark key={m} cell={p.turns.find((c) => c.month === m)} name={p.share.name} month={m} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><Check size={12} className="text-accent" aria-hidden /> covered and paid</span>
          <span><span className="font-semibold text-warn">½</span> part paid</span>
          <span className="inline-flex items-center gap-1"><X size={12} className="text-danger" aria-hidden /> covered, month has come, not paid yet</span>
          <span className="inline-flex items-center gap-1"><Circle size={10} aria-hidden /> covered, still to come</span>
          <span>· not their month</span>
          <span><span className="font-semibold text-warn">?</span> open: nobody has covered it yet</span>
        </p>
      </div>

      <details className="rounded-xl border border-line px-3 py-2 text-sm" open={openPast.length > 0}>
        <summary className="cursor-pointer font-medium">Who covers which month</summary>
        <form action={saveTurns} className="mt-3 space-y-3">
          <input type="hidden" name="billId" value={view.bill.id} />
          <p className="text-xs text-muted">
            The first month of each cycle is yours. The others go to whoever says they&apos;ll cover them: pick them here when they do (leave a month on &ldquo;nobody yet&rdquo; until then). A person&apos;s payment settles <strong>the month they covered</strong>.
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {editorMonths.map((m) => (
              <label key={m} className="text-xs text-muted">
                {shortMonthLabel(m)}
                <select name={`turn:${m}`} defaultValue={String(whoIn(m) ?? "")} className="input mt-1 w-full !py-1.5 text-sm text-foreground">
                  <option value="">Nobody yet</option>
                  <option value="you">You</option>
                  {r.people.map((p) => (
                    <option key={p.share.id} value={p.share.id}>
                      {p.share.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button className="btn-primary w-full !py-2.5 text-sm md:w-auto">Save</button>
        </form>
      </details>

      <SharingToggle billId={view.bill.id} billName={view.bill.name} sharing="turns" />
    </section>
  );
}
