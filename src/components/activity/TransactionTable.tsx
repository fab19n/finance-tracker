import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { bareRM } from "@/components/activity/filter-logic";
import { DeleteEntryForm } from "@/components/activity/DeleteEntryForm";
import { EntryDisc, SelectBox, deletable, entryHref, entryView } from "@/components/TransactionRow";
import { PendingMark } from "@/components/PendingMark";
import { shortDate } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import type { TxRow } from "@/lib/queries/transactions";
import { sortHeader, type SortColumn } from "./table-logic";

/** A column header that sorts: a link to the same list with the other order, `aria-sort` on the cell, an arrow (never colour alone). */
function SortableTh({ column, current, label, hrefFor, align = "left" }: { column: SortColumn; current: string; label: string; hrefFor: (sort: string) => string; align?: "left" | "right" }) {
  const { next, aria, label: name } = sortHeader(current, column);
  return (
    <th scope="col" aria-sort={aria} className={`px-2 py-1 font-bold ${align === "right" ? "text-right" : "text-left"}`}>
      <Link href={hrefFor(next)} aria-label={name} className={`inline-flex min-h-11 items-center gap-1 rounded-lg hover:underline ${aria === "none" ? "" : "text-foreground"}`}>
        {label}
        {aria === "ascending" ? <ArrowUp size={13} strokeWidth={3} aria-hidden /> : aria === "descending" ? <ArrowDown size={13} strokeWidth={3} aria-hidden /> : null}
        <PendingMark />
      </Link>
    </th>
  );
}

/**
 * The desktop list (md and up): a real table inside the paper sheet with the columns Date, Description (the category's icon
 * and the words), Category, Account and Amount. Date and Amount sort through the page's own `sort` parameter. The phone keeps
 * its day-by-day rows; both are on the page and CSS shows one, so the rows here are `txd-<id>` (the phone's are `tx-<id>`) and
 * `ScrollToHash` finds whichever is showing. In select mode the first column is a 44 px checkbox.
 */
export function TransactionTable({
  rows,
  viewing,
  backHref,
  sort,
  hrefFor,
  select = false,
}: {
  rows: TxRow[];
  viewing: number | null;
  backHref: string;
  /** The page's `sort` parameter ("" = newest first). */
  sort: string;
  /** The list's address with another `sort` (every other filter kept). */
  hrefFor: (sort: string) => string;
  select?: boolean;
}) {
  return (
    <div className="hidden overflow-x-auto md:block" data-dim-on-pending>
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">Entries, one per row. Date and Amount can be sorted.</caption>
        <thead className="text-[11px] uppercase tracking-[0.08em] text-muted">
          <tr className="border-b border-line">
            {select && (
              <th scope="col" className="w-11 px-2 py-1 text-left font-bold">
                <span className="sr-only">Select</span>
              </th>
            )}
            <SortableTh column="date" current={sort} label="Date" hrefFor={hrefFor} />
            <th scope="col" className="px-2 py-1 text-left font-bold">
              Description
            </th>
            <th scope="col" className="px-2 py-1 text-left font-bold">
              Category
            </th>
            <th scope="col" className="px-2 py-1 text-left font-bold">
              Account
            </th>
            <SortableTh column="amount" current={sort} label="Amount" hrefFor={hrefFor} align="right" />
            {!select && (
              <th scope="col" className="w-11 px-2 py-1">
                <span className="sr-only">Delete</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((tx) => {
            const { isTransfer, title, sign, color, icon } = entryView(tx, viewing);
            const account = isTransfer ? `${tx.accountName} → ${tx.toAccountName}` : tx.accountName;
            const description = (
              <span className="flex min-w-0 items-center gap-2.5">
                <EntryDisc tx={tx} isTransfer={isTransfer} icon={icon} />
                <span className="min-w-0 truncate font-bold">{title}</span>
              </span>
            );
            return (
              <tr key={tx.id} id={`txd-${tx.id}`} className="scroll-mt-24 border-b border-line last:border-b-0">
                {select && (
                  <td className="px-2">
                    <SelectBox tx={tx} />
                  </td>
                )}
                <td className="whitespace-nowrap px-2 py-1 font-medium text-muted">{shortDate(tx.date)}</td>
                <td className="max-w-[22rem] px-2 py-1">
                  {select ? (
                    description
                  ) : (
                    <Link href={entryHref(tx, backHref)} className="flex min-h-11 items-center rounded-xl">
                      {description}
                    </Link>
                  )}
                </td>
                <td className="px-2 py-1 font-medium">{isTransfer ? "Transfer" : (tx.categoryName ?? "")}</td>
                <td className="px-2 py-1 font-medium text-muted">{account}</td>
                <td className={`num whitespace-nowrap px-2 py-1 text-right font-bold ${color}`}>
                  {sign}
                  <span className="sr-only">RM </span>
                  {bareRM(formatRM(tx.amount))}
                </td>
                {!select && (
                  <td className="px-2">
                    <DeleteEntryForm id={tx.id} entry={deletable(tx)} variant="icon" />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
