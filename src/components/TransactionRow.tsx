import { ArrowRightLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { deleteTransaction } from "@/app/actions/transactions";
import type { TxRow } from "@/lib/queries/transactions";
import { initials } from "@/lib/initials";
import { formatRM } from "@/lib/money";
import { DeleteButton } from "./DeleteButton";

/**
 * One entry, as a row on a card. The initials tile is tinted with the category's own colour (user data); the letters stay
 * the normal text colour, so they are readable on any colour. Tapping the row opens the entry; Edit and Delete are also
 * plain visible buttons (no hidden gestures).
 */
export function TransactionRow({ tx, showDate = false }: { tx: TxRow; showDate?: boolean }) {
  const isTransfer = tx.type === "transfer";
  const title = isTransfer ? "Transfer" : tx.item || tx.categoryName || "Entry";
  const subtitle = isTransfer
    ? `${tx.accountName} → ${tx.toAccountName}`
    : [tx.item ? tx.categoryName : null, tx.accountName, showDate ? tx.date : null]
        .filter(Boolean)
        .join(" · ");
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "−" : "";
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
