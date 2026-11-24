import { isRealDate } from "@/lib/dates";
import { MAX_AMOUNT_MESSAGE, withinLimit } from "@/lib/limits";
import { formatRM } from "@/lib/money";

export type EntryType = "income" | "expense" | "transfer";

/**
 * An entry as it travels from the phone to the PC and into the database. Amounts are sen. `clientId` is made up on the
 * phone and never changes, so sending the same entry twice (a lost reply, a retry) can only ever make one row.
 */
export type WireEntry = {
  clientId: string;
  type: EntryType;
  amount: number;
  date: string;
  accountId: number;
  toAccountId: number | null;
  categoryId: number | null;
  item: string | null;
  note: string | null;
};

/**
 * What can be wrong with an entry without looking anything up. The phone runs this before it queues an entry, and the PC
 * runs it again when the entry arrives (src/lib/entries.ts adds the checks that need the database). Null = well-formed.
 * The messages are the ones the Add form has always shown.
 */
export function entryShapeError(e: Pick<WireEntry, "type" | "amount" | "date" | "accountId" | "toAccountId" | "categoryId">): string | null {
  if (!isRealDate(e.date)) return "Pick a valid date";
  if (!Number.isInteger(e.amount) || e.amount <= 0) return "Enter an amount greater than 0";
  if (!withinLimit(e.amount)) return MAX_AMOUNT_MESSAGE;
  if (!e.accountId) return "Pick an account";
  if (e.type === "transfer") {
    if (!e.toAccountId) return "Pick the account the money goes to";
    if (e.toAccountId === e.accountId) return "From and To accounts must differ";
  } else if (!e.categoryId) {
    return "Pick a category";
  }
  return null;
}

/**
 * What the green notice says after a plain save: what was added, for how much, and where
 * ("Added RM 12.50 · Eating Out · Cash in Hand", "Added RM 200.00 · Bank to Cash"). Names come from whatever the caller
 * already has; a missing one is left out rather than guessed.
 */
export function savedMessage(p: { type: EntryType; amount: number; category?: string | null; account?: string | null; toAccount?: string | null }): string {
  const where = p.type === "transfer" ? [p.account && p.toAccount ? `${p.account} to ${p.toAccount}` : null] : [p.category, p.account];
  return ["Added " + formatRM(p.amount), ...where].filter(Boolean).join(" · ");
}
