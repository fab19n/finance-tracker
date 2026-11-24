import type { ReactNode } from "react";
import { payBill } from "@/app/actions/plan";
import { ActionForm } from "@/components/ActionForm";
import { DuoIcon } from "@/components/DuoIcon";
import { Money } from "@/components/Money";
import { SubmitButton } from "@/components/SubmitButton";
import { categoryIconName } from "@/components/entry/entry-logic";
import { initials } from "@/lib/initials";
import { formatRM, senToInput } from "@/lib/money";
import type { BillInCycle } from "@/lib/plan/bills";
import { billStatusTag } from "@/lib/plan/bills-view";

type Props = {
  bill: { id: number; name: string; amountMin: number; amountMax: number };
  categoryName: string | null;
  /** This pay cycle's state of the bill; null for a paused bill (it is not part of the cycle). */
  item: BillInCycle | null;
  /** The line under the name (account, due date, range, who shares it). */
  caption: string;
  today: string;
  /** The Plan's one-account filter to come back to after Mark paid. */
  account?: number;
  /** The "Edit" disclosure's form, when the page offers one. */
  editForm?: ReactNode;
};

/**
 * One bill as a row of a `.rows` list (the board's bill row): a 40 px disc, the name with its caption, the amount, and under
 * them a status tag (Paid 1 Oct, Overdue · 3 days) or a gold small "Mark paid" that opens the amount and date, and an
 * "Edit" that opens the bill's form. Both disclosures are native <details>, so the page stays a server component.
 */
export function BillRow({ bill, categoryName, item, caption, today, account, editForm }: Props) {
  const tag = item ? billStatusTag(item) : null;
  const paid = item?.status === "paid";
  const icon = categoryIconName(categoryName ?? "") ?? categoryIconName(bill.name);
  // A paid bill shows what it really cost; an unpaid one its usual amount (the midpoint of its range).
  const shown = item?.paid ? item.paid.amount : Math.round((bill.amountMin + bill.amountMax) / 2);
  return (
    <li className={`py-3 ${item ? "" : "opacity-80"}`}>
      <div className="flex items-center gap-3">
        <span className="disc" aria-hidden>
          {icon ? <DuoIcon name={icon} size={20} aria-hidden /> : <span className="text-xs font-extrabold">{initials(bill.name)}</span>}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-bold">{bill.name}</p>
          <p className="text-[11.5px] font-medium leading-snug text-muted">{caption}</p>
        </div>
        <p className={`num shrink-0 text-[13px] font-bold ${paid ? "text-muted" : ""}`}>
          <span className="sr-only">{paid ? "Paid " : ""}</span>
          <Money sen={shown} />
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-[52px]">
        {!item && <span className="pill tag-warn">Paused</span>}
        {tag && (
          <span className={`pill tag-${tag.tone}`}>
            <DuoIcon name={tag.tone === "good" ? "check" : "alert"} size={14} aria-hidden />
            {tag.text}
          </span>
        )}
        {item && !paid && (
          <details className="open:w-full">
            <summary
              className="btn btn-primary btn-sm relative cursor-pointer list-none after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] [&::-webkit-details-marker]:hidden"
              aria-label={`Mark paid, ${bill.name}`}
            >
              Mark paid
            </summary>
            <ActionForm action={payBill} className="mt-2.5 grid grid-cols-2 gap-2.5 md:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="billId" value={bill.id} />
              {account && <input type="hidden" name="account" value={account} />}
              <div>
                <label className="label" htmlFor={`bill-${bill.id}-amount`}>
                  Amount paid (RM)
                </label>
                <input id={`bill-${bill.id}-amount`} name="amount" inputMode="decimal" defaultValue={senToInput(item.expected)} required className="input" />
              </div>
              <div>
                <label className="label" htmlFor={`bill-${bill.id}-date`}>
                  Paid on
                </label>
                <input id={`bill-${bill.id}-date`} name="date" type="date" defaultValue={today} required className="input" />
              </div>
              <SubmitButton pendingLabel="Recording..." className="btn-primary col-span-2 self-end md:col-span-1">
                Record
              </SubmitButton>
            </ActionForm>
          </details>
        )}
        {editForm && (
          <details className="open:w-full">
            <summary
              className="btn btn-sm relative cursor-pointer list-none after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] [&::-webkit-details-marker]:hidden"
              aria-label={`Edit ${bill.name}`}
            >
              Edit
            </summary>
            <div className="mt-3">{editForm}</div>
          </details>
        )}
      </div>
      {item?.unusual && item.paid && (
        <p className="mt-2 flex items-start gap-1.5 pl-[52px] text-xs font-extrabold text-warn">
          <DuoIcon name="alert" size={14} className="mt-px shrink-0" aria-hidden />
          {formatRM(item.paid.amount)} is outside the usual {formatRM(bill.amountMin)}
          {bill.amountMin === bill.amountMax ? "" : ` to ${formatRM(bill.amountMax)}`}: worth a look.
        </p>
      )}
    </li>
  );
}
