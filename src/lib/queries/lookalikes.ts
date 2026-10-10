import { and, eq, gte, inArray, isNotNull, lte, or } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, transactions } from "@/db/schema";
import { daysBetween, fromISO, shiftDays } from "@/lib/dates";

/**
 * The importer's duplicate check, turned around. The importer skips a statement line you already typed in; this finds the
 * statement line you are ABOUT to type in, so the Add form can ask "already in your books?" before it is counted twice.
 *
 * Only entries that came from a bank import count: a hand-typed one is your own decision. The slack is the importer's
 * (classify.ts): a day or two between the date you remember and the bank's posting date, and three for a transfer,
 * whose two sides post on different days. Change them together.
 */
export const LOOKALIKE_DAYS = 2;
export const LOOKALIKE_TRANSFER_DAYS = 3;
const MAX_SHOWN = 3;

type TxType = "income" | "expense" | "transfer";

/** The entry being typed. */
export type LookalikeQuery = {
  type: TxType;
  /** Sen, above 0. */
  amount: number;
  date: string;
  accountId: number;
  /** Transfers only: where the money goes. */
  toAccountId: number | null;
};

/** An imported entry that may be the same purchase, as the form shows it. */
export type Lookalike = {
  id: number;
  date: string;
  type: TxType;
  /** "CIMB", or "CIMB -> Cash in Hand" for a transfer. */
  where: string;
  /** What it is called now. */
  label: string;
  /** The bank's own wording, when that says more than the label does. */
  bankText: string | null;
  /**
   * Plain spending or income that no bill or person-sharing-a-bill owns, so the description and category you typed can go
   * straight onto it ("use this one"). A transfer has neither, and a bill's entry already has the bill's name and category.
   */
  adoptable: boolean;
};

type Existing = { type: TxType; accountId: number; toAccountId: number | null };

/**
 * Would `e` already record the movement `q` describes? Same direction test as the importer: money out of an account is an
 * expense or a transfer away from it, money in is an income or a transfer to it.
 */
function recordsSameMovement(q: LookalikeQuery, e: Existing): boolean {
  const outOf = (account: number) => e.accountId === account && (e.type === "expense" || e.type === "transfer");
  const into = (account: number) => (e.type === "income" && e.accountId === account) || (e.type === "transfer" && e.toAccountId === account);
  if (q.type === "expense") return outOf(q.accountId);
  if (q.type === "income") return into(q.accountId);
  // A transfer: the same transfer, or one side of it that the import filed as plain spending (out of the source)
  // or plain income (into the destination). The reverse transfer is a different movement.
  if (e.type === "transfer") return e.accountId === q.accountId && e.toAccountId === q.toAccountId;
  return e.type === "expense" ? e.accountId === q.accountId : e.accountId === q.toAccountId;
}

/** Imported entries that look like `q`, closest date first, at most three. Empty for anything that isn't a real entry yet. */
export function findLookalikes(db: DB, q: LookalikeQuery): Lookalike[] {
  if (!Number.isInteger(q.amount) || q.amount <= 0 || Number.isNaN(fromISO(q.date).getTime())) return [];
  if (q.type === "transfer" && q.toAccountId === null) return [];

  const ends = q.type === "transfer" ? [q.accountId, q.toAccountId!] : [q.accountId];
  const candidates = db
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      item: transactions.item,
      note: transactions.note,
      billId: transactions.billId,
      shareId: transactions.shareId,
    })
    .from(transactions)
    .where(
      and(
        isNotNull(transactions.importKey),
        eq(transactions.amount, q.amount),
        gte(transactions.date, shiftDays(q.date, -LOOKALIKE_TRANSFER_DAYS)),
        lte(transactions.date, shiftDays(q.date, LOOKALIKE_TRANSFER_DAYS)),
        or(inArray(transactions.accountId, ends), inArray(transactions.toAccountId, ends)),
      ),
    )
    .all();

  const near = candidates
    .map((e) => ({ e, gap: Math.abs(daysBetween(e.date, q.date)) }))
    .filter(({ e, gap }) => gap <= (e.type === "transfer" ? LOOKALIKE_TRANSFER_DAYS : LOOKALIKE_DAYS) && recordsSameMovement(q, e))
    .sort((a, b) => a.gap - b.gap || b.e.id - a.e.id)
    .slice(0, MAX_SHOWN);
  if (near.length === 0) return [];

  const names = new Map(db.select({ id: accounts.id, name: accounts.name }).from(accounts).all().map((a) => [a.id, a.name]));
  return near.map(({ e }) => {
    const item = e.item?.trim() || null;
    const note = e.note?.trim() || null;
    const from = names.get(e.accountId) ?? "an account";
    return {
      id: e.id,
      date: e.date,
      type: e.type,
      where: e.type === "transfer" ? `${from} -> ${e.toAccountId ? (names.get(e.toAccountId) ?? "an account") : "an account"}` : from,
      label: item ?? note ?? "Bank entry",
      // Only when there is a name AND the bank said something else; with no name, the bank's text already is the label.
      bankText: item && note && note.toLowerCase() !== item.toLowerCase() ? note.slice(0, 60) : null,
      adoptable: e.type !== "transfer" && e.billId === null && e.shareId === null,
    };
  });
}
