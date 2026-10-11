import { ArrowRightLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { deleteTransaction } from "@/app/actions/transactions";
import type { TxRow } from "@/lib/queries/transactions";
import { formatRM } from "@/lib/money";
import { DeleteButton } from "./DeleteButton";

/**
 * One entry. The tile is tinted with the category's own colour (user data); the label never uses it, so it stays readable
 * on any colour. Tapping the row opens the entry; Edit and Delete are also plain visible buttons (no hidden gestures).
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
  const color = tx.type === "income" ? "text-income" : isTransfer ? "text-muted" : "";

  return (
    <li className="flex items-center gap-1 py-0.5">
      <Link href={`/transactions/${tx.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pr-1">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full text-lg"
          style={{ backgroundColor: `${tx.categoryColor ?? "#64748b"}22` }}
          aria-hidden
        >
          {isTransfer ? <ArrowRightLeft size={18} className="text-muted" /> : (tx.categoryIcon ?? "•")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted">{subtitle}</p>
        </div>
        <p className={`num shrink-0 text-sm font-bold ${color}`}>
          {sign}
          {formatRM(tx.amount)}
        </p>
      </Link>
      <div className="flex shrink-0 items-center">
        <Link
          href={`/transactions/${tx.id}`}
          aria-label="Edit"
          title="Edit"
          className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-background hover:text-foreground"
        >
          <Pencil size={16} />
        </Link>
        <form action={deleteTransaction}>
          <input type="hidden" name="id" value={tx.id} />
          <DeleteButton />
        </form>
      </div>
    </li>
  );
}
