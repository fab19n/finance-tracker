import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ChevronDown } from "lucide-react";
import { coverMonth, saveTurns } from "@/app/actions/shares";
import { dayLabel, shiftMonth, shortMonthLabel } from "@/lib/dates";
import { initials } from "@/lib/initials";
import { formatRM } from "@/lib/money";
import { monthRange, rotationWindow, type TurnCell, type TurnPerson } from "@/lib/plan/shares";
import type { ShareRow, SharedBillView } from "@/lib/queries/shares";
import { MonthBadge, NoMonth } from "./MonthBadge";
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
  if (!cell)
    return (
      <td className="px-0 py-1">
        <NoMonth label={`${name}, ${shortMonthLabel(month)}: not their turn`} />
      </td>
    );
  // Never colour alone: each state has its own glyph and a text label.
  const label = `${name}, ${shortMonthLabel(month)}: ${turnLine(cell)}`;
  const kind = cell.state === "paid" ? "paid" : cell.state === "part" ? "part" : cell.state === "due" ? "unpaid" : "later";
  return (
    <td className="px-0 py-1">
      <MonthBadge kind={kind} label={label} />
    </td>
  );
}

/**
 * A bill paid in turns (Spotify): one person covers the whole month, and you take the first month of each cycle. Months
 * are not assigned in a fixed order: whoever says they will cover a month gets it, so a month is OPEN until then. Shows
 * your two latest cycles as a checklist (a mark only in the months that are THEIRS), who owes you for a month they
 * covered, and, for money that has arrived for a month nobody has been given yet, a one-tap "which month?".
 */
export function RotationCard({ view, people, bills, defaultStart, today }: { view: SharedBillView; people: ShareRow[]; bills: { id: number; name: string; sharing?: "monthly" | "turns" }[]; defaultStart: string; today: string }) {
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
    <section className="card space-y-3.5" aria-label={`${view.bill.name}, paid in turns`}>
      <div>
        <h2 className="h2">{view.bill.name}</h2>
        <p className="sub num mt-0.5">
          {formatRM(view.bill.amount)} a month · <strong className="text-foreground">one person pays the whole month</strong>, in turn
        </p>
      </div>

      <SharingToggle billId={view.bill.id} billName={view.bill.name} sharing="turns" />

      <div className="space-y-2">
        <p className={`banner font-extrabold ${r.owedToYou > 0 ? "banner-warn" : "banner-good"}`}>
          <span className="min-w-0">
            {r.owedToYou > 0 ? (
              <>
                Owed to you: {formatRM(r.owedToYou)}
                <span className="font-bold"> · {r.dueNow.map((d) => `${shortMonthLabel(d.month)} ${nameOf(d.shareId)}${d.amount < view.bill.amount ? ` (${formatRM(d.amount)})` : ""}`).join(", ")}</span>
              </>
            ) : (
              "Nobody owes you for a month they covered."
            )}
          </span>
        </p>
        {openPast.length > 0 && (
          <p className="banner banner-warn">
            <span className="min-w-0">
              <strong>{monthSpan(openPast)}</strong> {openPast.length === 1 ? "is" : "are"} still open: nobody has said they&apos;ll cover {openPast.length === 1 ? "it" : "them"} yet.
              {openLater.length > 0 && <span className="text-muted"> {monthSpan(openLater)} stay open too: whoever covers a month gets it.</span>}
            </span>
          </p>
        )}
        {openPast.length === 0 && openLater.length > 0 && (
          <p className="banner bg-card-subtle text-muted">
            <span className="min-w-0">
              Open: {monthSpan(openLater)}. Whoever says they&apos;ll cover a month gets it.
            </span>
          </p>
        )}
        {claims.map((c) => (
          <ActionForm key={c.txId} action={coverMonth} className="flex flex-wrap items-center gap-2 rounded-2xl bg-card-subtle p-3">
            <input type="hidden" name="billId" value={view.bill.id} />
            <input type="hidden" name="shareId" value={c.person.share.id} />
            <span className="basis-full text-[13px] font-semibold leading-snug">
              <strong>{c.person.share.name}</strong> sent {formatRM(c.amount)} on {dayLabel(c.date)}. <span className="text-muted">Which month did they cover?</span>
            </span>
            {open.length > 0 ? (
              <>
                <select name="month" defaultValue={open[0]} className="input min-w-0 flex-1" aria-label={`Month ${c.person.share.name} covered`}>
                  {open.map((m) => (
                    <option key={m} value={m}>
                      {shortMonthLabel(m)}
                    </option>
                  ))}
                </select>
                <SubmitButton className="btn" pendingLabel="Counting...">Count it</SubmitButton>
              </>
            ) : (
              <span className="sub basis-full">No month is open this cycle: set it in the planner below.</span>
            )}
          </ActionForm>
        ))}
      </div>

      <ul className="space-y-1.5">
        {r.people.map((p) => {
          const s = standing(p, thisMonth, cycle);
          const person = mine.find((m) => m.id === p.share.id);
          return (
            <li key={p.share.id} className="rounded-2xl bg-card-subtle px-3 py-2.5">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
                  <span className="grid size-[34px] shrink-0 place-items-center rounded-xl bg-card text-xs font-black" aria-hidden>
                    {initials(p.share.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="truncate text-[13px] font-extrabold">{p.share.name}</span>
                      {!p.share.active && <span className="pill bg-card text-muted">left</span>}
                    </span>
                    <span className={`block text-[11px] font-extrabold leading-snug ${s.tone === "owes" ? "text-warn" : s.tone === "ok" ? "text-muted" : "text-foreground"}`}>{s.text}</span>
                  </span>
                  <span className="num shrink-0 text-right text-[11px] font-bold text-muted">{formatRM(p.share.share)} per turn</span>
                  <ChevronDown size={16} strokeWidth={2.5} className="shrink-0 text-muted transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="mt-3 space-y-3 text-[13px] font-semibold">
                  {p.turns.length > 0 ? (
                    <ul className="space-y-1 text-muted">
                      {p.turns.map((c) => (
                        <li key={c.month}>
                          <span className="font-extrabold text-foreground">{shortMonthLabel(c.month)}</span> · {turnLine(c)}
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

      <div>
        <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Who covered which month, for your two latest cycles. Scrolls sideways on a small screen; use the arrow keys.">
          <table className="w-full table-fixed border-collapse text-xs" style={{ minWidth: 54 + columns.length * 34 }}>
            <caption className="sr-only">Who covers each month, for your two latest cycles</caption>
            <colgroup>
              <col className="w-[54px]" />
            </colgroup>
            <thead className="text-muted">
              <tr>
                <th className="sticky left-0 z-10 bg-card py-1.5 pr-2 text-left text-[10.5px] font-bold">Month</th>
                {columns.map((m) => (
                  <th key={m} scope="col" className="px-0 py-1.5 text-center text-[10.5px] font-bold leading-tight">
                    {shortMonthLabel(m).split(" ")[0]}
                    <span className="block text-[10px] font-semibold">{m.slice(2, 4)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.some((m) => whoIn(m) === undefined) && (
                <tr className="border-t border-line">
                  <th scope="row" className="sticky left-0 z-10 bg-card py-1.5 pr-2 text-left text-xs font-extrabold text-muted">Open</th>
                  {columns.map((m) => (
                    <td key={m} className="px-0 py-1">
                      {whoIn(m) === undefined ? <MonthBadge kind="open" label={`${shortMonthLabel(m)}: open, nobody has covered it yet`} /> : <NoMonth label={`${shortMonthLabel(m)}: covered`} />}
                    </td>
                  ))}
                </tr>
              )}
              <tr className="border-t border-line">
                <th scope="row" className="sticky left-0 z-10 bg-card py-1.5 pr-2 text-left text-xs font-extrabold text-muted">You</th>
                {columns.map((m) =>
                  whoIn(m) === "you" ? (
                    <td key={m} className="px-0 py-1">
                      <MonthBadge kind="you" label={`${shortMonthLabel(m)}: your month${r.charged.includes(m) ? ", paid" : ""}`} />
                    </td>
                  ) : (
                    <td key={m} className="px-0 py-1">
                      <NoMonth label={`${shortMonthLabel(m)}: not your month`} />
                    </td>
                  ),
                )}
              </tr>
              {r.people.map((p) => (
                <tr key={p.share.id} className="border-t border-line">
                  <th scope="row" className="sticky left-0 z-10 truncate bg-card py-1.5 pr-2 text-left text-xs font-extrabold">
                    {p.share.name}
                  </th>
                  {columns.map((m) => (
                    <Mark key={m} cell={p.turns.find((c) => c.month === m)} name={p.share.name} month={m} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-bold text-muted">
          <span className="inline-flex items-center gap-1.5"><MonthBadge kind="paid" label="covered and paid" small /> covered and paid</span>
          <span className="inline-flex items-center gap-1.5"><MonthBadge kind="part" label="part paid" small /> part paid</span>
          <span className="inline-flex items-center gap-1.5"><MonthBadge kind="unpaid" label="covered, month has come, not paid yet" small /> not paid yet</span>
          <span className="inline-flex items-center gap-1.5"><MonthBadge kind="later" label="covered, still to come" small /> covered, still to come</span>
          <span className="inline-flex items-center gap-1.5"><MonthBadge kind="you" label="your month" small /> your month</span>
          {columns.some((m) => whoIn(m) === undefined) && <span className="inline-flex items-center gap-1.5"><MonthBadge kind="open" label="open" small /> open: nobody has covered it yet</span>}
          <span>· not their month</span>
        </p>
      </div>

      <details className="group rounded-2xl bg-card-subtle px-3.5 py-3" open={openPast.length > 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-extrabold [&::-webkit-details-marker]:hidden">
          Who covers which month
          <ChevronDown size={16} strokeWidth={2.5} className="shrink-0 text-muted transition group-open:rotate-180" aria-hidden />
        </summary>
        <ActionForm action={saveTurns} className="mt-3 space-y-3">
          <input type="hidden" name="billId" value={view.bill.id} />
          <p className="sub leading-relaxed">
            The first month of each cycle is yours. The others go to whoever says they&apos;ll cover them: pick them here when they do (leave a month on &ldquo;nobody yet&rdquo; until then). A person&apos;s payment settles <strong className="text-foreground">the month they covered</strong>.
          </p>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
            {editorMonths.map((m) => (
              <label key={m} className="min-w-0">
                <span className="label">{shortMonthLabel(m)}</span>
                <select name={`turn:${m}`} defaultValue={String(whoIn(m) ?? "")} className="input">
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
          <SubmitButton className="btn-primary w-full md:w-auto" pendingLabel="Saving...">Save</SubmitButton>
        </ActionForm>
      </details>

    </section>
  );
}
