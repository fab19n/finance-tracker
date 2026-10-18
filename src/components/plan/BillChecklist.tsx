import { Check } from "lucide-react";
import { payBill } from "@/app/actions/plan";
import { shortDate } from "@/lib/dates";
import { formatRM, senToInput } from "@/lib/money";
import type { BillInCycle, BillsSummary } from "@/lib/plan/bills";

type Item = BillInCycle & { categoryName: string | null; categoryIcon: string | null };

/** What a bill's second line says. For an overdue one it starts with the word, so the red row never relies on colour. */
function when(i: Item): string {
  if (i.status === "paid" && i.paid) return `Paid ${shortDate(i.paid.date)}`;
  if (i.daysUntilDue === null || !i.dueDate) return "Set a due day to track it";
  if (i.daysUntilDue < 0) return `Overdue · was due ${shortDate(i.dueDate)} (${-i.daysUntilDue} day${i.daysUntilDue === -1 ? "" : "s"} ago)`;
  if (i.daysUntilDue === 0) return "Due today";
  if (i.daysUntilDue <= 5) return `Due soon · in ${i.daysUntilDue} day${i.daysUntilDue === 1 ? "" : "s"} (${shortDate(i.dueDate)})`;
  return `Due ${shortDate(i.dueDate)}`;
}

const range = (min: number, max: number) => (min === max ? formatRM(min) : `${formatRM(min)} - ${formatRM(max)}`);

/** This cycle's bills as a checklist, most urgent first. Unpaid ones can be ticked off with the real amount. */
export function BillChecklist({ items, summary, today }: { items: Item[]; summary: BillsSummary; today: string }) {
  if (items.length === 0) {
    return <p className="sub">No bills yet. Add your rent, insurance and subscriptions and this becomes your payday checklist.</p>;
  }
  // Drawn inside the "Bills this cycle" card on the Plan page, which supplies the frame.
  return (
    <div>
      <p className="sub mb-3">
        <strong className="text-foreground">
          {summary.paidCount} of {summary.count}
        </strong>{" "}
        paid · {formatRM(summary.paidTotal)} out · <strong className="text-foreground">{formatRM(summary.remaining)}</strong> still to find
        {summary.overdueCount > 0 && <span className="font-extrabold text-danger"> · {summary.overdueCount} overdue</span>}
      </p>
      <ul className="space-y-1.5">
        {items.map((i) => {
          const paid = i.status === "paid";
          const overdue = i.status === "overdue";
          return (
            <li key={i.bill.id} className={`rounded-2xl px-3 py-2.5 ${overdue ? "bg-danger-soft" : "bg-card-subtle"}`}>
              <div className="flex items-center gap-2.5">
                <span
                  className={`grid size-[22px] shrink-0 place-items-center rounded-full border-2 ${
                    paid ? "border-good bg-good text-card" : overdue ? "border-danger" : "border-muted"
                  }`}
                  aria-hidden
                >
                  {paid && <Check size={12} strokeWidth={3.5} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[13px] font-extrabold ${paid ? "text-muted line-through decoration-1" : overdue ? "text-danger" : ""}`}>{i.bill.name}</p>
                  <p className={`truncate text-[11px] font-bold ${overdue ? "text-danger" : "text-muted"}`}>{when(i)}</p>
                </div>
                <p className={`num shrink-0 text-[13px] font-black ${paid ? "text-muted" : overdue ? "text-danger" : ""}`}>
                  {i.paid ? formatRM(i.paid.amount) : range(i.bill.amountMin, i.bill.amountMax)}
                </p>
              </div>
              {i.unusual && i.paid && (
                <p className="mt-1 pl-8 text-xs font-extrabold text-warn">
                  {formatRM(i.paid.amount)} is outside the usual {range(i.bill.amountMin, i.bill.amountMax)} - worth a look.
                </p>
              )}
              {!paid && (
                <details className="pl-8 pt-1">
                  <summary className="pill cursor-pointer list-none bg-accent-soft text-accent-strong [&::-webkit-details-marker]:hidden">Mark paid →</summary>
                  <form action={payBill} className="mt-2.5 grid grid-cols-2 gap-2.5 md:grid-cols-[1fr_1fr_auto]">
                    <input type="hidden" name="billId" value={i.bill.id} />
                    <div>
                      <label className="label">Amount paid (RM)</label>
                      <input name="amount" inputMode="decimal" defaultValue={senToInput(i.expected)} required className="input" />
                    </div>
                    <div>
                      <label className="label">Paid on</label>
                      <input name="date" type="date" defaultValue={today} required className="input" />
                    </div>
                    <button className="btn-primary col-span-2 self-end md:col-span-1">Record</button>
                  </form>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
