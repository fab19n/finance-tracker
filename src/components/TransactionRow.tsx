import { ArrowRightLeft } from "lucide-react";
import Link from "next/link";
import { deleteTransaction } from "@/app/actions/transactions";
import { DuoIcon } from "@/components/DuoIcon";
import { categoryIconName } from "@/components/entry/entry-logic";
import { bareRM } from "@/components/activity/filter-logic";
import type { TxRow } from "@/lib/queries/transactions";
import { shortDate } from "@/lib/dates";
import { initials } from "@/lib/initials";
import { formatRM } from "@/lib/money";
import { withBack } from "@/lib/back";
import { transferView } from "@/lib/transfer-view";
import { DeleteButton } from "./DeleteButton";

/**
 * One entry, as a flat row of the day's list (the design's row: a 40 px round disc, the title over "Category · Account", the
 * signed amount; a 1px divider between rows, at least 56 px tall). The disc holds the category's dual-tone icon (the same
 * mapping as the Add screen) tinted with the category's own colour (user data); a category no icon fits shows its initials
 * (never a wrong picture), the letters in the normal text colour. Tapping the row opens the entry (that is the one way to
 * edit); Delete is a plain visible 44 px button whose label names the entry, so a screen reader hears WHICH one. The amount
 * has no "RM": the list says "amounts in RM" once (a screen reader still hears it).
 */
export function TransactionRow({ tx, showDate = false, viewing = null, backHref }: { tx: TxRow; showDate?: boolean; viewing?: number | null; /** The list this row is on: the entry's page returns there after Save, Delete and Back. */ backHref?: string }) {
  const entryHref = backHref ? withBack(`/transactions/${tx.id}`, backHref) : `/transactions/${tx.id}`;
  const isTransfer = tx.type === "transfer";
  // In one account's list a transfer is money going out or coming in, so it says which and gets a sign.
  const transfer = transferView(tx, viewing);
  const title = isTransfer ? tx.item || transfer.title : tx.item || tx.categoryName || "Entry";
  // When the list isn't grouped by day (sorted by amount) the date comes FIRST: the end of the line is what gets cut off.
  const when = showDate ? shortDate(tx.date) : null;
  const subtitle = isTransfer
    ? [when, `${tx.accountName} → ${tx.toAccountName}`].filter(Boolean).join(" · ")
    : [when, tx.item ? tx.categoryName : null, tx.accountName].filter(Boolean).join(" · ");
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "−" : transfer.sign === "-" ? "−" : transfer.sign;
  const color = tx.type === "income" ? "text-good" : isTransfer ? "text-muted" : "";
  const icon = !isTransfer && tx.categoryName ? categoryIconName(tx.categoryName) : null;

  return (
    <li className="flex min-h-14 items-center gap-0.5 border-t border-line first:border-t-0">
      <Link href={entryHref} className="flex min-h-14 min-w-0 flex-1 items-center gap-2.5 rounded-xl py-2">
        <span className="disc" style={tx.categoryColor && !isTransfer ? { backgroundColor: `${tx.categoryColor}26` } : undefined} aria-hidden>
          {isTransfer ? (
            <ArrowRightLeft size={18} className="text-muted" />
          ) : icon ? (
            <DuoIcon name={icon} size={20} aria-hidden />
          ) : (
            <span className="text-xs font-extrabold">{initials(tx.categoryName)}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-bold">{title}</p>
          <p className="truncate text-[11.5px] font-medium text-muted">{subtitle}</p>
        </div>
        <p className={`num shrink-0 text-[13px] font-bold ${color}`}>
          {sign}
          <span className="sr-only">RM </span>
          {bareRM(formatRM(tx.amount))}
        </p>
      </Link>
      <form action={deleteTransaction} className="shrink-0">
        <input type="hidden" name="id" value={tx.id} />
        <DeleteButton
          entry={{
            type: tx.type,
            amount: tx.amount,
            date: tx.date,
            item: tx.item,
            categoryName: tx.categoryName,
            accountName: tx.accountName,
            toAccountName: tx.toAccountName,
            billId: tx.billId,
            shareId: tx.shareId,
            imported: tx.imported,
          }}
        />
      </form>
    </li>
  );
}
