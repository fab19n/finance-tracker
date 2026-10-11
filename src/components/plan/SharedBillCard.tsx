import { Check, Minus, X } from "lucide-react";
import { shortMonthLabel } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import type { PersonLedger } from "@/lib/plan/shares";
import type { ShareRow, SharedBillView } from "@/lib/queries/shares";
import { RotationCard } from "./RotationCard";
import { ShareForm } from "./ShareForm";
import { SharingToggle } from "./SharingToggle";

const MONTHS_SHOWN = 12;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One line that says where this person stands. */
function standing(p: PersonLedger): { text: string; tone: "ok" | "owes" | "ahead" } {
  if (p.status === "owes") {
    const firstUnpaid = p.cells.find((c) => c.state !== "paid");
    return { text: `Owes ${formatRM(p.balance)} (${plural(p.monthsOwed, "month")}${firstUnpaid ? `, since ${shortMonthLabel(firstUnpaid.month)}` : ""})`, tone: "owes" };
  }
  if (p.status === "ahead") {
    return { text: p.monthsAhead > 0 ? `Paid ahead ${plural(p.monthsAhead, "month")}` : `Credit ${formatRM(-p.balance)}`, tone: "ahead" };
  }
  return { text: "Paid up", tone: "ok" };
}

function Cell({ state, name, month }: { state: "paid" | "partial" | "unpaid" | "none"; name: string; month: string }) {
  // Never colour alone: each state has its own mark and a text label.
  const label = `${name}, ${shortMonthLabel(month)}: ${state === "none" ? "not sharing yet" : state}`;
  if (state === "none") return <td className="px-1 py-1 text-center text-muted" title={label}><span aria-label={label}>·</span></td>;
  if (state === "paid")
    return (
      <td className="px-1 py-1 text-center text-accent" title={label}>
        <Check size={14} className="inline" aria-label={label} />
      </td>
    );
  if (state === "partial")
    return (
      <td className="px-1 py-1 text-center font-semibold text-warn" title={label}>
        <span aria-label={label}>½</span>
      </td>
    );
  return (
    <td className="px-1 py-1 text-center text-danger" title={label}>
      <X size={14} className="inline" aria-label={label} />
    </td>
  );
}

/**
 * A shared bill. Split in equal parts every month (Netflix): who owes what, who has paid through when, and a grid of who
 * has covered which month. Paid in turns (Spotify): see RotationCard.
 */
export function SharedBillCard({ view, people, bills, defaultStart, today }: { view: SharedBillView; people: ShareRow[]; bills: { id: number; name: string }[]; defaultStart: string; today: string }) {
  if (view.rotation) return <RotationCard view={view} people={people} bills={bills} defaultStart={defaultStart} today={today} />;
  const shown = view.months.slice(-MONTHS_SHOWN);
  const hidden = view.months.length - shown.length;
  const mine = people.filter((p) => p.billId === view.bill.id);

  return (
    <section className="card space-y-4" aria-label={`${view.bill.name}, shared`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">{view.bill.name}</h2>
        <p className="num text-sm text-muted">
          {formatRM(view.bill.amount)} a month · it costs you <strong className="text-foreground">{formatRM(view.yourMonthlyCost)}</strong> once the others pay their part
        </p>
      </div>

      <p className={`rounded-xl px-3 py-2 text-sm font-medium ${view.owedToYou > 0 ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"}`}>
        {view.owedToYou > 0 ? `Owed to you: ${formatRM(view.owedToYou)}` : "Everyone is paid up."}
        {view.paidAhead > 0 && <span className="font-normal"> ({formatRM(view.paidAhead)} paid in advance)</span>}
      </p>

      <ul className="divide-y divide-line">
        {view.people.map((p) => {
          const s = standing(p);
          return (
            <li key={p.share.id} className="py-2">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="font-medium">
                    {p.share.name}
                    {!p.share.active && <span className="pill ml-1.5 bg-background text-muted">left{p.share.endMonth ? ` after ${shortMonthLabel(p.share.endMonth)}` : ""}</span>}
                    <span className="ml-2 text-xs font-normal text-muted">{formatRM(p.share.share)} / month</span>
                  </span>
                  <span className={`text-sm font-medium ${s.tone === "owes" ? "text-warn" : s.tone === "ahead" ? "text-accent" : "text-muted"}`}>{s.text}</span>
                </summary>
                <div className="mt-2 space-y-3 text-sm">
                  <p className="text-muted">
                    {p.paidThrough ? `Covered through ${shortMonthLabel(p.paidThrough)}.` : "Nothing covered yet."}{" "}
                    {p.lastPayment ? `Last paid ${formatRM(p.lastPayment.amount)} on ${p.lastPayment.date}.` : "No payment received."}{" "}
                    Charged {formatRM(p.owed)} so far, received {formatRM(p.paid)}.
                  </p>
                  {mine.find((m) => m.id === p.share.id) && <ShareForm share={mine.find((m) => m.id === p.share.id)} bills={bills} defaultStart={defaultStart} />}
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      {shown.length > 0 && (
        <div className="overflow-x-auto" tabIndex={0} aria-label="Who has covered which month">
          <table className="w-full min-w-[28rem] border-collapse text-xs">
            <caption className="sr-only">Months each person has covered</caption>
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-2 text-left font-medium">{hidden > 0 ? `Last ${MONTHS_SHOWN} months` : "Month"}</th>
                {shown.map((m) => (
                  <th key={m} scope="col" className="px-1 py-1 text-center font-medium">
                    {shortMonthLabel(m).split(" ")[0]}
                    <span className="block text-[11px] font-normal">{m.slice(2, 4)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.people.map((p) => (
                <tr key={p.share.id} className="border-t border-line">
                  <th scope="row" className="whitespace-nowrap py-1 pr-2 text-left font-medium">
                    {p.share.name}
                  </th>
                  {shown.map((m) => (
                    <Cell key={m} name={p.share.name} month={m} state={p.cells.find((c) => c.month === m)?.state ?? "none"} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1"><Check size={12} className="text-accent" aria-hidden /> paid</span>
            <span><span className="font-semibold text-warn">½</span> part paid</span>
            <span className="inline-flex items-center gap-1"><X size={12} className="text-danger" aria-hidden /> not paid yet</span>
            <span className="inline-flex items-center gap-1"><Minus size={12} aria-hidden /> a lump sum covers the oldest months first</span>
          </p>
        </div>
      )}

      <SharingToggle billId={view.bill.id} billName={view.bill.name} sharing={view.bill.sharing} />
    </section>
  );
}
