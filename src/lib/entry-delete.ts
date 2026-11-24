import { shortDate } from "@/lib/dates";
import { formatRM } from "@/lib/money";

/** What the delete sheet needs to know about an entry. All of it is on a list row already. */
export type DeletableEntry = {
  type: "income" | "expense" | "transfer";
  amount: number;
  date: string;
  item: string | null;
  categoryName: string | null;
  accountName?: string | null;
  toAccountName?: string | null;
  billId?: number | null;
  shareId?: number | null;
  /** 1 when a bank statement import wrote it. */
  imported?: number;
};

/** "teh tarik, RM 3.50": the words that name ONE entry (for a button's label and the sheet's title). */
export function entryName(e: DeletableEntry): string {
  const what =
    e.item?.trim() ||
    (e.type === "transfer" ? (e.accountName && e.toAccountName ? `Transfer ${e.accountName} to ${e.toAccountName}` : "Transfer") : e.categoryName) ||
    "Entry";
  return `${what}, ${formatRM(e.amount)}`;
}

/** What deleting would also undo, one plain sentence each: a bill left unpaid, a person owing again, an import that returns. */
export function deleteWarnings(e: Pick<DeletableEntry, "billId" | "shareId" | "imported">): string[] {
  const out: string[] = [];
  if (e.billId) out.push("It is counted as a payment of one of your bills, so that bill will show as unpaid again.");
  if (e.shareId) out.push("It is counted as a payment from someone who shares a bill with you, so they will owe it again.");
  if (e.imported) out.push("It came from a bank statement. Importing that statement again would bring it back.");
  return out;
}

/** The sheet that asks before deleting: a title naming the entry, the date, and anything else the delete would undo. */
export function deleteSheet(e: DeletableEntry): { title: string; body: string; warnings: string[] } {
  return {
    title: `Delete ${entryName(e)}?`,
    body: `Dated ${shortDate(e.date)}. It will be removed from your books. This can't be undone.`,
    warnings: deleteWarnings(e),
  };
}
