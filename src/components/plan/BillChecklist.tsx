import { Check } from "lucide-react";
import { payBill } from "@/app/actions/plan";
import { shortDate } from "@/lib/dates";
import { formatRM, senToInput } from "@/lib/money";
import type { BillInCycle, BillStatus, BillsSummary } from "@/lib/plan/bills";

type Item = BillInCycle & { categoryName: string | null; categoryIcon: string | null };

const PILL: Record<BillStatus, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-accent-soft text-accent" },
  overdue: { label: "Overdue", cls: "bg-danger-soft text-danger" },
  due_soon: { label: "Due soon", cls: "bg-warn-soft text-warn" },
  upcoming: { label: "Upcoming", cls: "bg-background text-muted" },
  unscheduled: { label: "No due date", cls: "bg-background text-muted" },
};

function when(i: Item): string {
  if (i.status === "paid" && i.paid) return `Paid ${shortDate(i.paid.date)}`;
  if (i.daysUntilDue === null || !i.dueDate) return "Set a due day to track it";
  if (i.daysUntilDue < 0) return `Was due ${shortDate(i.dueDate)} (${-i.daysUntilDue} day${i.daysUntilDue === -1 ? "" : "s"} ago)`;
  if (i.daysUntilDue === 0) return "Due today";
  if (i.daysUntilDue <= 5) return `Due in ${i.daysUntilDue} day${i.daysUntilDue === 1 ? "" : "s"} (${shortDate(i.dueDate)})`;
  return `Due ${shortDate(i.dueDate)}`;
}

const range = (min: number, max: number) => (min === max ? formatRM(min) : `${formatRM(min)} - ${formatRM(max)}`);

/** This cycle's bills as a checklist, most urgent first. Unpaid ones can be ticked off with the real amount. */
export function BillChecklist({ items, summary, today }: { items: Item[]; summary: BillsSummary; today: string }) {
  if (items.length === 0) {
    return <p className="px-4 pb-4 text-sm text-muted">No bills yet. Add your rent, insurance and subscriptions and this becomes your payday checklist.</p>;
  }
  // Drawn inside the "Bills this cycle" card on the Plan page, which supplies the frame.
  return (
    <div>
      <p className="px-4 pb-3 text-sm text-muted">
        <strong className="text-foreground">
          {summary.paidCount} of {summary.count}
        </strong>{" "}
        paid · {formatRM(summary.paidTotal)} out · <strong className="text-foreground">{formatRM(summary.remaining)}</strong> still to find
        {summary.overdueCount > 0 && <span className="font-semibold text-danger"> · {summary.overdueCount} overdue</span>}
      </p>
      <ul className="divide-y divide-line border-t border-line">
        {items.map((i) => {
          const pill = PILL[i.status];
          return (
            <li key={i.bill.id} className={`px-4 py-3 ${i.status === "overdue" ? "bg-danger-soft/40" : ""}`}>
              <div className="flex items-center gap-3">
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full ${i.status === "paid" ? "bg-accent-soft text-accent" : "bg-background"}`}
                  aria-hidden
                >
                  {i.status === "paid" ? <Check size={16} /> : <span>{i.categoryIcon ?? "•"}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium ${i.status === "paid" ? "text-muted line-through decoration-1" : ""}`}>{i.bill.name}</p>
                  <p className={`truncate text-xs ${i.status === "overdue" ? "font-medium text-danger" : "text-muted"}`}>{when(i)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-sm font-semibold">{i.paid ? formatRM(i.paid.amount) : range(i.bill.amountMin, i.bill.amountMax)}</p>
                  <span className={`pill ${pill.cls}`}>{pill.label}</span>
                </div>
              </div>
              {i.unusual && i.paid && (
                <p className="mt-1 pl-12 text-xs font-semibold text-warn">
                  {formatRM(i.paid.amount)} is outside the usual {range(i.bill.amountMin, i.bill.amountMax)} - worth a look.
                </p>
              )}
              {i.status !== "paid" && (
                <details className="pl-12 pt-1 text-sm">
                  <summary className="cursor-pointer list-none py-1 text-xs font-bold text-accent">Mark paid →</summary>
                  <form action={payBill} className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_auto]">
                    <input type="hidden" name="billId" value={i.bill.id} />
                    <div>
                      <label className="label">Amount paid (RM)</label>
                      <input name="amount" inputMode="decimal" defaultValue={senToInput(i.expected)} required className="input" />
                    </div>
                    <div>
                      <label className="label">Paid on</label>
                      <input name="date" type="date" defaultValue={today} required className="input" />
                    </div>
                    <button className="btn-primary col-span-2 self-end !py-2.5 text-sm md:col-span-1">Record</button>
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
