import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { DB } from "@/db/open";
import { isRealDate } from "@/lib/dates";
import { MAX_AMOUNT_MESSAGE, withinLimit } from "@/lib/limits";
import { accounts, billShares, categories, importBatches, importRules, recurringBills, transactions } from "@/db/schema";
import type { CommitInput, CommitResult, CommitRow } from "./api-types";
import { rulePattern } from "./classify";

/** Entries touching the account (either side of a transfer) dated before `date`. */
export function countEntriesBefore(db: DB, accountId: number, date: string): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(transactions)
      .where(and(or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId)), lt(transactions.date, date)))
      .get()?.n ?? 0
  );
}

/** The longest an Item may be (the form's limit; the review screen's box has no maxlength). */
export const MAX_ITEM_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 400;
export const MAX_KEY_LENGTH = 300;

/**
 * Per-row shape problems that would otherwise fail the whole import with a generic message: an Item or key that is
 * too long. Names the row the way `commitRows` does (the position among the lines being imported, skipped ones not
 * counted). A description over the limit is not a problem: only its first 200 characters are kept.
 */
export function rowShapeProblem(rows: readonly { kind: string; date?: unknown; description?: unknown; item?: unknown; key?: unknown }[]): string | null {
  const todo = rows.filter((r) => r && r.kind !== "skip");
  for (const [i, r] of todo.entries()) {
    const where = `Row ${i + 1} (${String(r.date ?? "")} ${String(r.description ?? "").slice(0, 30)})`;
    if (typeof r.item === "string" && r.item.length > MAX_ITEM_LENGTH) {
      return `${where}: the Item is ${r.item.length} characters long; shorten it to ${MAX_ITEM_LENGTH} or fewer.`;
    }
    if (typeof r.key === "string" && r.key.length > MAX_KEY_LENGTH) return `${where}: its reference is too long.`;
  }
  return null;
}

/**
 * Write the reviewed rows. Everything is validated against the database first and inserted in ONE
 * transaction: a problem anywhere means nothing is imported, never half a statement.
 */
export function commitRows(db: DB, input: CommitInput): CommitResult {
  const account = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
  if (!account || account.type === "investment") return { ok: false, error: "That account can't be imported into." };

  if (input.setOpeningBalance !== null && !withinLimit(input.setOpeningBalance)) return { ok: false, error: MAX_AMOUNT_MESSAGE };

  type Writable = CommitRow & { kind: "expense" | "income" | "transfer" };
  const todo = input.rows.filter((r): r is Writable => r.kind !== "skip");
  const cats = new Map(db.select().from(categories).all().map((c) => [c.id, c]));
  const accIds = new Set(db.select({ id: accounts.id }).from(accounts).all().map((a) => a.id));
  const billIds = new Set(db.select({ id: recurringBills.id }).from(recurringBills).all().map((b) => b.id));
  const shareIds = new Set(db.select({ id: billShares.id }).from(billShares).all().map((s) => s.id));

  for (const [i, r] of todo.entries()) {
    const where = `Row ${i + 1} (${r.date} ${r.description.slice(0, 30)})`;
    if (!isRealDate(r.date)) return { ok: false, error: `${where}: the date isn't valid.` };
    if (!Number.isInteger(r.amount) || r.amount === 0) return { ok: false, error: `${where}: the amount isn't valid.` };
    if (!withinLimit(r.amount)) return { ok: false, error: `${where}: ${MAX_AMOUNT_MESSAGE}.` };
    if (r.item.length > MAX_ITEM_LENGTH) return { ok: false, error: `${where}: the Item is too long (${MAX_ITEM_LENGTH} characters at most).` };
    if (r.kind === "transfer") {
      if (!r.transferAccountId || !accIds.has(r.transferAccountId) || r.transferAccountId === account.id) {
        return { ok: false, error: `${where}: pick the OTHER account for this transfer.` };
      }
    } else {
      const cat = r.categoryId ? cats.get(r.categoryId) : undefined;
      if (!cat) return { ok: false, error: `${where}: choose a category.` };
      if (cat.type !== r.kind) return { ok: false, error: `${where}: "${cat.name}" is a${cat.type === "income" ? "n income" : "n expense"} category.` };
    }
    if (r.billId && !billIds.has(r.billId)) return { ok: false, error: `${where}: that bill no longer exists.` };
    if (r.shareId && !shareIds.has(r.shareId)) return { ok: false, error: `${where}: that person is no longer on a shared bill.` };
  }

  // Another run (a double click, a second tab) may have imported some of these meanwhile.
  const keys = todo.map((r) => r.key);
  const already = new Set(
    keys.length
      ? db.select({ k: transactions.importKey }).from(transactions).where(inArray(transactions.importKey, keys)).all().map((x) => x.k)
      : [],
  );

  // Anything on this account dated BEFORE the statement starts means its balance is already in progress. Entries on or
  // after that day (including transfers mirrored here by importing the other account first) don't get in the way.
  const firstDate = input.rows.reduce((first, r) => (r.date < first ? r.date : first), input.rows[0]?.date ?? "0000-00-00");
  const entriesBefore = countEntriesBefore(db, account.id, firstDate);
  let imported = 0;
  let transfers = 0;
  let rulesSaved = 0;
  let openingSet = false;
  // Every entry this run writes carries this id, which is what "Undo this import" deletes by.
  const batchId = crypto.randomUUID();

  db.transaction((tx) => {
    for (const r of todo) {
      if (already.has(r.key)) continue;
      const abs = Math.abs(r.amount);
      const note = r.description.slice(0, 200) || null;
      if (r.kind === "transfer") {
        const out = r.amount < 0;
        tx.insert(transactions)
          .values({
            date: r.date,
            type: "transfer",
            amount: abs,
            accountId: out ? account.id : r.transferAccountId!,
            toAccountId: out ? r.transferAccountId! : account.id,
            item: r.item.trim() || null,
            note,
            importKey: r.key,
            importBatch: batchId,
          })
          .run();
        transfers++;
      } else {
        tx.insert(transactions)
          .values({
            date: r.date,
            type: r.kind,
            amount: abs,
            accountId: account.id,
            categoryId: r.categoryId,
            item: r.item.trim() || null,
            note,
            billId: r.kind === "expense" ? r.billId : null,
            shareId: r.kind === "income" ? r.shareId ?? null : null,
            importKey: r.key,
            importBatch: batchId,
          })
          .run();
      }
      imported++;

      if (r.remember) {
        const pattern = rulePattern(r.description);
        if (pattern.length >= 3) {
          const values = {
            pattern,
            kind: r.kind,
            categoryId: r.kind === "transfer" ? null : r.categoryId,
            item: r.item.trim() || null,
            billId: r.kind === "expense" ? r.billId : null,
            transferAccountId: r.kind === "transfer" ? r.transferAccountId : null,
          };
          // A name that goes to SEVERAL of your accounts ("PAYER ONE A/L DOE": CIMB one day, your e-wallet the next) can't
          // be one rule. A transfer decision never re-points an existing transfer rule at a different account, or one
          // correction would send every later own-name transfer to the wrong place.
          const known = r.kind === "transfer" ? tx.select().from(importRules).where(eq(importRules.pattern, pattern)).get() : undefined;
          const repoints = known?.kind === "transfer" && known.transferAccountId !== values.transferAccountId;
          if (!repoints) {
            // Otherwise the latest decision for a pattern wins.
            tx.insert(importRules).values(values).onConflictDoUpdate({ target: importRules.pattern, set: values }).run();
            rulesSaved++;
          }
        }
      }
    }

    // Starting from a statement: make the books begin where the bank's balance began. Only for an empty account,
    // otherwise it would silently shift every balance you've already built up.
    if (input.setOpeningBalance !== null && entriesBefore === 0) {
      tx.update(accounts).set({ openingBalance: input.setOpeningBalance }).where(eq(accounts.id, account.id)).run();
      openingSet = true;
    }

    // The record that makes the import undoable; written in the same transaction, so it exists exactly when the entries do.
    if (imported > 0 || openingSet) {
      tx.insert(importBatches)
        .values({ id: batchId, accountId: account.id, rowCount: imported, openingBefore: openingSet ? account.openingBalance : null })
        .run();
    }
  });

  return { ok: true, imported, skipped: input.rows.length - imported, transfers, rulesSaved, openingSet, batchId: imported > 0 || openingSet ? batchId : null };
}
