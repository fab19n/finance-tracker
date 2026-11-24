import { ArrowRightLeft } from "lucide-react";
import Link from "next/link";
import { DuoIcon } from "@/components/DuoIcon";
import { categoryIconName } from "@/components/entry/entry-logic";
import { bareRM } from "@/components/activity/filter-logic";
import { DeleteEntryForm } from "@/components/activity/DeleteEntryForm";
import { BULK_FORM_ID } from "@/components/activity/bulk-logic";
import type { TxRow } from "@/lib/queries/transactions";
import { shortDate } from "@/lib/dates";
import { entryName, type DeletableEntry } from "@/lib/entry-delete";
import { initials } from "@/lib/initials";
import { formatRM } from "@/lib/money";
import { withBack, withFragment } from "@/lib/back";
import { transferView } from "@/lib/transfer-view";

/** The pieces of one entry both the phone row and the desktop table show: its words, its signed amount and its icon. */
export function entryView(tx: TxRow, viewing: number | null) {
  const isTransfer = tx.type === "transfer";
  // In one account's list a transfer is money going out or coming in, so it says which and gets a sign.
  const transfer = transferView(tx, viewing);
  const title = isTransfer ? tx.item || transfer.title : tx.item || tx.categoryName || "Entry";
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "−" : transfer.sign === "-" ? "−" : transfer.sign;
  const color = tx.type === "income" ? "text-good" : isTransfer ? "text-muted" : "";
  const icon = !isTransfer && tx.categoryName ? categoryIconName(tx.categoryName) : null;
  return { isTransfer, title, sign, color, icon };
}

/** What the delete sheet and the checkbox's name need to know about a row. */
export function deletable(tx: TxRow): DeletableEntry {
  return {
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
  };
}

/** The address that opens an entry from a list and brings you back to ITS row (`#tx-<id>`) afterwards. */
export function entryHref(tx: TxRow, backHref?: string): string {
  return backHref ? withBack(`/transactions/${tx.id}`, withFragment(backHref, `tx-${tx.id}`)) : `/transactions/${tx.id}`;
}

/** The round category disc (a transfer's arrows, a category's icon, or its initials). */
export function EntryDisc({ tx, isTransfer, icon }: { tx: TxRow; isTransfer: boolean; icon: ReturnType<typeof categoryIconName> | null }) {
  return (
    <span className="disc" style={tx.categoryColor && !isTransfer ? { backgroundColor: `${tx.categoryColor}26` } : undefined} aria-hidden>
      {isTransfer ? (
        <ArrowRightLeft size={18} className="text-muted" />
      ) : icon ? (
        <DuoIcon name={icon} size={20} aria-hidden />
      ) : (
        <span className="text-xs font-extrabold">{initials(tx.categoryName)}</span>
      )}
    </span>
  );
}

/** The 44 px checkbox of select mode: named for the entry, tied to the bulk form, carrying what the bar adds up. */
export function SelectBox({ tx }: { tx: TxRow }) {
  return (
    <span className="grid size-11 shrink-0 place-items-center">
      <input
        type="checkbox"
        form={BULK_FORM_ID}
        name="id"
        value={tx.id}
        aria-label={`Select ${entryName(deletable(tx))}`}
        data-type={tx.type}
        data-amount={tx.amount}
        data-linked={tx.billId || tx.shareId || tx.imported ? "1" : "0"}
        className="size-5 accent-accent-strong"
      />
    </span>
  );
}

/**
 * One entry, as a flat row of the day's list (the design's row: a 40 px round disc, the title over "Category · Account", the
 * signed amount; a 1px divider between rows, at least 56 px tall). The disc holds the category's dual-tone icon (the same
 * mapping as the Add screen) tinted with the category's own colour (user data); a category no icon fits shows its initials
 * (never a wrong picture), the letters in the normal text colour. Tapping the row opens the entry (that is the one way to
 * edit); Delete is a plain visible 44 px button whose label names the entry, so a screen reader hears WHICH one. The amount
 * has no "RM": the list says "amounts in RM" once (a screen reader still hears it).
 *
 * The row has the id `tx-<id>`: the entry's page remembers it in its back link, so Back, Save and Delete land on this row
 * rather than the top of a 100-row list. In `select` mode the row is a label around a 44 px checkbox and opens nothing.
 */
export function TransactionRow({
  tx,
  showDate = false,
  viewing = null,
  backHref,
  select = false,
}: {
  tx: TxRow;
  showDate?: boolean;
  viewing?: number | null;
  /** The list this row is on: the entry's page returns there after Save, Delete and Back. */
  backHref?: string;
  select?: boolean;
}) {
  const { isTransfer, title, sign, color, icon } = entryView(tx, viewing);
  // When the list isn't grouped by day (sorted by amount) the date comes FIRST: the end of the line is what gets cut off.
  const when = showDate ? shortDate(tx.date) : null;
  const subtitle = isTransfer
    ? [when, `${tx.accountName} → ${tx.toAccountName}`].filter(Boolean).join(" · ")
    : [when, tx.item ? tx.categoryName : null, tx.accountName].filter(Boolean).join(" · ");

  const body = (
    <>
      <EntryDisc tx={tx} isTransfer={isTransfer} icon={icon} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold">{title}</p>
        <p className="truncate text-[11.5px] font-medium text-muted">{subtitle}</p>
      </div>
      <p className={`num shrink-0 text-[13px] font-bold ${color}`}>
        {sign}
        <span className="sr-only">RM </span>
        {bareRM(formatRM(tx.amount))}
      </p>
    </>
  );

  return (
    <li id={`tx-${tx.id}`} className="flex min-h-14 scroll-mt-24 items-center gap-0.5 border-t border-line first:border-t-0">
      {select ? (
        <label className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-xl py-1">
          <SelectBox tx={tx} />
          <span className="flex min-w-0 flex-1 items-center gap-2.5">{body}</span>
        </label>
      ) : (
        <>
          <Link href={entryHref(tx, backHref)} className="flex min-h-14 min-w-0 flex-1 items-center gap-2.5 rounded-xl py-2">
            {body}
          </Link>
          <DeleteEntryForm id={tx.id} entry={deletable(tx)} variant="icon" className="shrink-0" />
        </>
      )}
    </li>
  );
}
