import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { monthLabel, shortMonthLabel } from "@/lib/dates";
import { initials } from "@/lib/initials";
import { formatRM } from "@/lib/money";
import type { MonthCell, PersonLedger } from "@/lib/plan/shares";
import { standingText } from "@/lib/plan/shares-text";
import type { ShareRow, SharedBillView } from "@/lib/queries/shares";
import { MonthBadge, NoMonth, StatusTag } from "./MonthBadge";
import { RotationCard } from "./RotationCard";
import { ShareActions } from "./ShareForm";
import { SharingToggle } from "./SharingToggle";

// Six columns fit a phone beside the name column; older months stay in each person's own list.
const MONTHS_SHOWN = 6;

/** The months a person still has something to pay for: charged ones they owe now, then ones not charged yet. */
function breakdown(p: PersonLedger): MonthCell[] {
  return [...p.cells.filter((c) => c.remaining > 0), ...p.upcoming.filter((c) => c.remaining > 0)];
}

function Cell({ state, name, month, notCharged, detail }: { state: "paid" | "partial" | "unpaid" | "none"; name: string; month: string; notCharged?: boolean; detail?: string }) {
  // Never colour alone: each state has its own glyph and a text label.
  const what = state === "none" ? (notCharged ? "not charged yet" : "not sharing yet") : state === "paid" && notCharged ? "paid in advance" : state;
  const label = `${name}, ${shortMonthLabel(month)}: ${what}${detail ? `, ${detail}` : ""}`;
  return (
    <td className="px-0 py-1">
      {state === "none" ? (
        <NoMonth label={label} />
      ) : (
        <MonthBadge kind={state === "paid" ? (notCharged ? "advance" : "paid") : state === "partial" ? "part" : "unpaid"} label={label} />
      )}
    </td>
  );
}

/**
 * A shared bill. Split in equal parts every month (Netflix): who owes what, who has paid through when, and a grid of who
 * has covered which month. Paid in turns (Spotify): see RotationCard.
 */
export function SharedBillCard({ view, people, bills, defaultStart, today }: { view: SharedBillView; people: ShareRow[]; bills: { id: number; name: string; sharing?: "monthly" | "turns" }[]; defaultStart: string; today: string }) {
  if (view.rotation) return <RotationCard view={view} people={people} bills={bills} defaultStart={defaultStart} today={today} />;
  const shown = view.months.slice(-MONTHS_SHOWN);
  const hidden = view.months.length - shown.length;
  // Months not charged yet that somebody has already paid into follow the charged ones, marked "next".
  const columns = [...shown, ...view.upcomingMonths.filter((m) => !shown.includes(m))];
  const mine = people.filter((p) => p.billId === view.bill.id);
  // The latest charged month: what each person has paid towards it, of what it costs them.
  const latest = shown[shown.length - 1];
  const soFarRows = latest
    ? view.people.flatMap((p) => {
        const c = p.cells.find((x) => x.month === latest);
        return c ? [{ id: p.share.id, name: p.share.name, paid: c.paid, cost: c.cost }] : [];
      })
    : [];
  const soFar = latest && soFarRows.length > 0 ? { month: latest, rows: soFarRows, total: soFarRows.reduce((n, r) => n + r.cost, 0), paid: soFarRows.reduce((n, r) => n + Math.min(r.paid, r.cost), 0) } : null;

  return (
    <section id={`bill-${view.bill.id}`} className="card scroll-mt-4 space-y-3.5" aria-label={`${view.bill.name}, shared`}>
      <div>
        <h2 className="h2">{view.bill.name}</h2>
        <p className="sub num mt-0.5">
          {formatRM(view.bill.amount)} a month · it costs you <strong className="text-foreground">{formatRM(view.yourMonthlyCost)}</strong> once the others pay their part
        </p>
      </div>

      <p role="status" className={`banner font-extrabold ${view.owedToYou > 0 ? "banner-warn" : "banner-good"}`}>
        {view.owedToYou > 0 ? <AlertTriangle aria-hidden /> : <CheckCircle2 aria-hidden />}
        <span className="min-w-0">
          {view.owedToYou > 0 ? `Owed to you: ${formatRM(view.owedToYou)}` : "Everyone is paid up."}
          {view.paidAhead > 0 && <span className="font-bold"> ({formatRM(view.paidAhead)} paid in advance)</span>}
          {view.expectedNext > 0 && <span className="block text-xs font-bold">{formatRM(view.expectedNext)} more expected once the next month is charged</span>}
        </span>
      </p>

      <ul className="space-y-1.5">
        {view.people.map((p) => {
          const s = standingText(p);
          const rows = breakdown(p);
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
                      <StatusTag tone={s.tone === "owes" ? "warn" : s.tone === "ahead" ? "info" : "good"}>{s.tone === "owes" ? "Owes" : s.tone === "ahead" ? "Ahead" : "Paid up"}</StatusTag>
                      {!p.share.active && <span className="pill bg-card text-muted">left{p.share.endMonth ? ` after ${shortMonthLabel(p.share.endMonth)}` : ""}</span>}
                    </span>
                    <span className="block text-[11px] font-bold leading-snug text-muted">{s.text}</span>
                  </span>
                  <span className="num shrink-0 text-right text-[11px] font-bold text-muted">{formatRM(p.share.share)} / month</span>
                  <ChevronDown size={16} strokeWidth={2.5} className="shrink-0 text-muted transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="mt-3 space-y-3">
                  <p className="sub leading-relaxed">
                    {p.paidThrough ? `Covered through ${shortMonthLabel(p.paidThrough)}.` : "Nothing covered yet."}{" "}
                    {p.lastPayment ? `Last paid ${formatRM(p.lastPayment.amount)} on ${p.lastPayment.date}.` : "No payment received."}{" "}
                    Charged {formatRM(p.owed)} so far, received {formatRM(p.paid)}.
                  </p>
                  {rows.length > 0 && (
                    // A stacked list, not a table: four columns do not fit a phone, and the amount to pay must never scroll out of view.
                    <ul className="divide-y divide-line text-xs" aria-label={`What ${p.share.name} still has to pay, month by month`}>
                      {rows.map((c) => (
                        <li key={c.month} className="flex items-start justify-between gap-3 py-2">
                          <span className="min-w-0">
                            <span className="font-extrabold">{shortMonthLabel(c.month)}</span>
                            {c.upcoming && <span className="font-bold text-muted"> · not charged yet</span>}
                            <span className="num block text-[11px] font-bold text-muted">
                              paid {formatRM(c.paid)} of {c.upcoming ? "about " : ""}{formatRM(c.cost)}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="num block font-black text-warn">{formatRM(c.remaining)}</span>
                            <span className="block text-[11px] font-bold text-muted">to pay</span>
                          </span>
                        </li>
                      ))}
                      <li className="flex items-baseline justify-between gap-3 py-2 font-extrabold">
                        <span>Owed now</span>
                        <span className="num font-black">{formatRM(p.owedNow)}</span>
                      </li>
                      {p.expectedNext > 0 && (
                        <li className="flex items-baseline justify-between gap-3 py-2 font-extrabold text-muted">
                          <span className="min-w-0">More once those months are charged</span>
                          <span className="num shrink-0 font-black">{formatRM(p.expectedNext)}</span>
                        </li>
                      )}
                    </ul>
                  )}
                  {mine.find((m) => m.id === p.share.id) && <ShareActions share={mine.find((m) => m.id === p.share.id)!} bills={bills} defaultStart={defaultStart} />}
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      {shown.length > 0 && (
        <div>
          <h3 className="mb-1 text-[13px] font-extrabold">Who has covered which month</h3>
          <div>
            <table className="w-full table-fixed border-collapse text-xs">
              <caption className="sr-only">Months each person has covered</caption>
              <colgroup>
                <col className="w-[54px]" />
              </colgroup>
              <thead className="text-muted">
                <tr>
                  <th className="py-1.5 pr-2 text-left text-[10.5px] font-bold">{hidden > 0 ? `Last ${MONTHS_SHOWN} months` : "Month"}</th>
                  {columns.map((m) => (
                    <th key={m} scope="col" className="px-0 py-1.5 text-center text-[10.5px] font-bold leading-tight">
                      {shortMonthLabel(m).split(" ")[0]}
                      <span className="block text-[10px] font-semibold">{!shown.includes(m) ? "next" : m.slice(2, 4)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.people.map((p) => (
                  <tr key={p.share.id} className="border-t border-line">
                    <th scope="row" className="truncate py-1.5 pr-2 text-left text-xs font-extrabold">
                      {p.share.name}
                    </th>
                    {columns.map((m) => {
                      const notCharged = !shown.includes(m);
                      const c = (notCharged ? p.upcoming : p.cells).find((x) => x.month === m);
                      // A part-paid month says how much of what, because the mark alone cannot.
                      const detail = c && c.state === "partial" ? `paid ${formatRM(c.paid)} of ${formatRM(c.cost)}` : undefined;
                      return <Cell key={m} name={p.share.name} month={m} state={c?.state ?? "none"} notCharged={notCharged} detail={detail} />;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-bold text-muted">
            <span className="inline-flex items-center gap-1.5"><MonthBadge kind="paid" label="paid" small /> paid</span>
            <span className="inline-flex items-center gap-1.5"><MonthBadge kind="part" label="part paid" small /> part paid</span>
            <span className="inline-flex items-center gap-1.5"><MonthBadge kind="unpaid" label="not paid yet" small /> not paid yet</span>
            {view.upcomingMonths.length > 0 && <span className="inline-flex items-center gap-1.5"><MonthBadge kind="advance" label="paid in advance" small /> paid in advance (next = not charged yet)</span>}
            <span className="basis-full">A lump sum covers the oldest months first, at the price it was paid at.</span>
          </p>
        </div>
      )}

      {soFar && (
        <div className="rounded-2xl bg-card-subtle p-3.5">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-extrabold">{monthLabel(soFar.month).split(" ")[0]} so far</h3>
            <span className="num text-xs font-bold text-muted">{formatRM(soFar.paid)} of {formatRM(soFar.total)}</span>
          </div>
          <ul className="space-y-2.5">
            {soFar.rows.map((r) => (
              <li key={r.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs font-bold">
                  <span className="truncate font-extrabold">{r.name}</span>
                  <span className="num shrink-0 text-muted">
                    {formatRM(r.paid)} of {formatRM(r.cost)}{r.paid >= r.cost ? " · paid" : ""}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-card" aria-hidden>
                  <div className="h-full rounded-full bg-good" style={{ width: `${r.cost > 0 ? Math.min(100, (r.paid / r.cost) * 100) : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SharingToggle billId={view.bill.id} billName={view.bill.name} sharing={view.bill.sharing} />
    </section>
  );
}
