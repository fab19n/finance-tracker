import Link from "next/link";
import { BillRow } from "@/components/plan/BillRow";
import { formatRM } from "@/lib/money";
import type { BillInCycle, BillsSummary } from "@/lib/plan/bills";
import { billCaption } from "@/lib/plan/bills-view";

type Item = BillInCycle & { categoryName: string | null; categoryIcon: string | null };

/**
 * This cycle's bills as the board's list: one card of rows, most urgent first, each with its status tag or a "Mark paid".
 * `accountNames` says which account pays each bill; leave it out when the page is already showing one account.
 */
export function BillChecklist({
  items,
  summary,
  today,
  account,
  accountNames,
}: {
  items: Item[];
  summary: BillsSummary;
  today: string;
  account?: number;
  accountNames?: Map<number, string>;
}) {
  if (items.length === 0) {
    return (
      <p className="card sub">
        No bills yet. Add your rent, insurance and subscriptions in{" "}
        <Link href="/plan/bills" className="font-extrabold text-accent-strong underline-offset-2 hover:underline">
          Bills
        </Link>{" "}
        and this becomes your payday checklist.
      </p>
    );
  }
  return (
    <div className="space-y-2.5">
      <p className="sub px-1">
        <strong className="text-foreground">
          {summary.paidCount} of {summary.count}
        </strong>{" "}
        paid · {formatRM(summary.paidTotal)} out · <strong className="text-foreground">{formatRM(summary.remaining)}</strong> still to find
        {summary.overdueCount > 0 && <span className="font-extrabold text-danger"> · {summary.overdueCount} overdue</span>}
      </p>
      <ul className="rows">
        {items.map((i) => (
          <BillRow
            key={i.bill.id}
            bill={i.bill}
            categoryName={i.categoryName}
            item={i}
            today={today}
            account={account}
            caption={billCaption(i.bill, { account: accountNames?.get(i.bill.accountId), dueDate: i.dueDate, nextDue: i.nextDue })}
          />
        ))}
      </ul>
    </div>
  );
}
