import { Check, ChevronDown, Minus, X } from "lucide-react";
import { shortMonthLabel } from "@/lib/dates";
import { initials } from "@/lib/initials";
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
  if (state === "none") return <td className="px-1 py-1.5 text-center text-muted" title={label}><span aria-label={label}>·</span></td>;
  if (state === "paid")
    return (
      <td className="px-1 py-1.5 text-center text-good" title={label}>
        <Check size={14} strokeWidth={3} className="inline" aria-label={label} />
      </td>
    );
  if (state === "partial")
    return (
      <td className="px-1 py-1.5 text-center font-black text-warn" title={label}>
        <span aria-label={label}>½</span>
      </td>
    );
  return (
    <td className="px-1 py-1.5 text-center text-danger" title={label}>
      <X size={14} strokeWidth={3} className="inline" aria-label={label} />
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
    <section className="card space-y-3.5" aria-label={`${view.bill.name}, shared`}>
      <div>
        <h2 className="h2">{view.bill.name}</h2>
        <p className="sub num mt-0.5">
          {formatRM(view.bill.amount)} a month · it costs you <strong className="text-foreground">{formatRM(view.yourMonthlyCost)}</strong> once the others pay their part
        </p>
      </div>

      <p className={`banner font-extrabold ${view.owedToYou > 0 ? "banner-warn" : "banner-good"}`}>
        <span className="min-w-0">
          {view.owedToYou > 0 ? `Owed to you: ${formatRM(view.owedToYou)}` : "Everyone is paid up."}
          {view.paidAhead > 0 && <span className="font-bold"> ({formatRM(view.paidAhead)} paid in advance)</span>}
        </span>
      </p>

      <ul className="space-y-1.5">
        {view.people.map((p) => {
          const s = standing(p);
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
                      {!p.share.active && <span className="pill bg-card text-muted">left{p.share.endMonth ? ` after ${shortMonthLabel(p.share.endMonth)}` : ""}</span>}
                    </span>
                    <span className={`block text-[11px] font-extrabold leading-snug ${s.tone === "owes" ? "text-warn" : s.tone === "ahead" ? "text-good" : "text-muted"}`}>{s.text}</span>
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
                  {mine.find((m) => m.id === p.share.id) && <ShareForm share={mine.find((m) => m.id === p.share.id)} bills={bills} defaultStart={defaultStart} />}
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      {shown.length > 0 && (
        <div>
          <div className="overflow-x-auto" tabIndex={0} aria-label="Who has covered which month">
            <table className="w-full min-w-[28rem] border-collapse text-xs">
              <caption className="sr-only">Months each person has covered</caption>
              <thead className="text-muted">
                <tr>
                  <th className="py-1.5 pr-2 text-left font-extrabold">{hidden > 0 ? `Last ${MONTHS_SHOWN} months` : "Month"}</th>
                  {shown.map((m) => (
                    <th key={m} scope="col" className="px-1 py-1.5 text-center font-extrabold">
                      {shortMonthLabel(m).split(" ")[0]}
                      <span className="block text-[11px] font-bold">{m.slice(2, 4)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.people.map((p) => (
                  <tr key={p.share.id} className="border-t border-line">
                    <th scope="row" className="whitespace-nowrap py-1.5 pr-2 text-left font-extrabold">
                      {p.share.name}
                    </th>
                    {shown.map((m) => (
                      <Cell key={m} name={p.share.name} month={m} state={p.cells.find((c) => c.month === m)?.state ?? "none"} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-muted">
            <span className="inline-flex items-center gap-1"><Check size={12} strokeWidth={3} className="text-good" aria-hidden /> paid</span>
            <span><span className="font-black text-warn">½</span> part paid</span>
            <span className="inline-flex items-center gap-1"><X size={12} strokeWidth={3} className="text-danger" aria-hidden /> not paid yet</span>
            <span className="inline-flex items-center gap-1"><Minus size={12} aria-hidden /> a lump sum covers the oldest months first</span>
          </p>
        </div>
      )}

      <SharingToggle billId={view.bill.id} billName={view.bill.name} sharing={view.bill.sharing} />
    </section>
  );
}
