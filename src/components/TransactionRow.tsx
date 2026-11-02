import { ArrowRightLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { deleteTransaction } from "@/app/actions/transactions";
import type { TxRow } from "@/lib/queries/transactions";
import { shortDate } from "@/lib/dates";
import { initials } from "@/lib/initials";
import { formatRM } from "@/lib/money";
import { transferView } from "@/lib/transfer-view";
import { DeleteButton } from "./DeleteButton";

/**
 * One entry, as a row on a card. The initials tile is tinted with the category's own colour (user data); the letters stay
 * the normal text colour, so they are readable on any colour. Tapping the row opens the entry; Edit and Delete are also
 * plain visible buttons (no hidden gestures).
 */
export function TransactionRow({ tx, showDate = false, viewing = null }: { tx: TxRow; showDate?: boolean; viewing?: number | null }) {
  const isTransfer = tx.type === "transfer";
  // In one account's list a transfer is money going out or coming in, so it says which and gets a sign.
  const transfer = transferView(tx, viewing);
  const title = isTransfer ? transfer.title : tx.item || tx.categoryName || "Entry";
  // When the list isn't grouped by day (sorted by amount) the date comes FIRST: the end of the line is what gets cut off.
  const when = showDate ? shortDate(tx.date) : null;
  const subtitle = isTransfer
    ? [when, `${tx.accountName} → ${tx.toAccountName}`].filter(Boolean).join(" · ")
    : [when, tx.item ? tx.categoryName : null, tx.accountName].filter(Boolean).join(" · ");
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "−" : transfer.sign === "-" ? "−" : transfer.sign;
  const color = tx.type === "income" ? "text-good" : isTransfer ? "text-muted" : "";

  return (
    <li className="flex items-center gap-0.5 rounded-2xl bg-card py-0.5 pl-1.5 pr-1">
      <Link href={`/transactions/${tx.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-2">
        <span
          className="grid size-[34px] shrink-0 place-items-center rounded-xl bg-card-subtle text-xs font-black"
          style={tx.categoryColor && !isTransfer ? { backgroundColor: `${tx.categoryColor}26` } : undefined}
          aria-hidden
        >
          {isTransfer ? <ArrowRightLeft size={16} className="text-muted" /> : initials(tx.categoryName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-extrabold">{title}</p>
          <p className="truncate text-[11px] font-bold text-muted">{subtitle}</p>
        </div>
        <p className={`num shrink-0 text-[13px] font-black ${color}`}>
          {sign}
          {formatRM(tx.amount)}
        </p>
      </Link>
      <div className="flex shrink-0 items-center">
        <Link
          href={`/transactions/${tx.id}`}
          aria-label="Edit"
          title="Edit"
          className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-card-subtle hover:text-foreground"
        >
          <Pencil size={15} />
        </Link>
        <form action={deleteTransaction}>
          <input type="hidden" name="id" value={tx.id} />
          <DeleteButton />
        </form>
      </div>
    </li>
  );
}
