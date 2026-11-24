"use server";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { accounts, billShares, categories, recurringBills, transactions } from "@/db/schema";
import { safeBackPath } from "@/lib/back";
import { isRealDate, shortDate } from "@/lib/dates";
import { MAX_AMOUNT_MESSAGE, withinLimit } from "@/lib/limits";
import { checkEntry } from "@/lib/entries";
import { BULK_MAX, bulkDeletedMessage, categorySetMessage, cleanIds, planDelete, planSetCategory, type BulkRow, type BulkVerdict } from "@/lib/entry-bulk";
import { decodeUndo, encodeUndo, withDeleted } from "@/lib/entry-delete";
import { savedMessage } from "@/lib/entry-shape";
import { amountError, formatRM, parseSen } from "@/lib/money";
import { findLookalikes } from "@/lib/queries/lookalikes";

export type FormState = { ok: boolean; error?: string; message?: string; nonce?: number };

const Input = z.object({
  id: z.string().optional(),
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
  accountId: z.string().min(1, "Pick an account"),
  toAccountId: z.string().optional(),
  categoryId: z.string().optional(),
  item: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
});

function refreshAll() {
  revalidatePath("/", "layout");
}

export async function saveTransaction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = Input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid entry" };
  const v = parsed.data;

  const amount = parseSen(v.amount);
  if (amount === null || amount <= 0) return { ok: false, error: amountError(v.amount) ?? "Enter an amount greater than 0" };

  const db = await getDb();
  // The same rule book the phone's sync uses (src/lib/entries.ts), so an entry is judged identically either way in.
  const checked = checkEntry(db, {
    type: v.type,
    amount,
    date: v.date,
    accountId: Number(v.accountId),
    toAccountId: Number(v.toAccountId) || null,
    categoryId: Number(v.categoryId) || null,
    item: v.item ?? null,
    note: v.note ?? null,
  });
  if (!checked.ok) return { ok: false, error: checked.error };
  const row = checked.row;

  if (v.id) {
    // A link only makes sense for the kind of entry it was made for: a bill payment is an expense, a sharer's payment is
    // income. Turning the entry into something else must not leave it counted against the bill or the person.
    const { changes } = db
      .update(transactions)
      .set({ ...row, ...(row.type === "expense" ? {} : { billId: null }), ...(row.type === "income" ? {} : { shareId: null }) })
      .where(eq(transactions.id, Number(v.id)))
      .run();
    if (changes !== 1) return { ok: false, error: "That entry no longer exists (it may have been deleted). Nothing was changed." };
    refreshAll();
    // Back to the list the entry was opened from (a same-site path only), else the current month.
    redirect(safeBackPath(formData.get("back")) ?? "/transactions");
  }
  db.insert(transactions).values(row).run();
  refreshAll();
  const name = (id: number | null | undefined) => (id ? (db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, id)).get()?.name ?? null) : null);
  const category = row.categoryId ? db.select({ name: categories.name }).from(categories).where(eq(categories.id, row.categoryId)).get()?.name : null;
  return {
    ok: true,
    message: savedMessage({ type: row.type, amount: row.amount, category, account: name(row.accountId), toAccount: name(row.toAccountId) }),
    nonce: Date.now(),
  };
}

const Adopt = z.object({
  adopt: z.string().regex(/^\d+$/, "Pick which bank entry to use"),
  type: z.enum(["income", "expense"]),
  amount: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
  accountId: z.string().min(1, "Pick an account"),
  categoryId: z.string().optional(),
  item: z.string().max(120).optional(),
});

/**
 * "Same purchase: use the bank's entry." The Add form's answer to its own "already in your books?" warning: instead of
 * adding a second entry, put the description and category you typed onto the one the bank import already wrote.
 *
 * Only those two things move. The date, amount and account stay the bank's, and so does its `note` (the bank's own text):
 * the date is what a later import matches on, and the text is what the importer learns each payee from (history.ts).
 * The entry must still be a current lookalike of what the form holds, so a stale or forged request can't rewrite some
 * other line. Bill and sharer entries are never offered (see `adoptable`).
 */
export async function adoptLookalike(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = Adopt.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid entry" };
  const v = parsed.data;

  const amount = parseSen(v.amount);
  if (amount === null || amount <= 0) return { ok: false, error: amountError(v.amount) ?? "Enter an amount greater than 0" };

  const db = await getDb();
  const item = v.item?.trim() || null;
  let categoryId: number | null = null;
  if (v.categoryId) {
    categoryId = Number(v.categoryId);
    const cat = db.select().from(categories).where(eq(categories.id, categoryId)).get();
    if (!cat || cat.type !== v.type) return { ok: false, error: "Category doesn't match the entry type" };
  }
  if (!item && categoryId === null) {
    return { ok: false, error: "Pick a category or say what it was first, so there is something to put on the bank's entry." };
  }

  const target = findLookalikes(db, { type: v.type, amount, date: v.date, accountId: Number(v.accountId), toAccountId: null }).find(
    (l) => l.id === Number(v.adopt) && l.adoptable,
  );
  const gone = { ok: false, error: "That bank entry no longer matches this amount, account and date. Check them and try again." };
  if (!target) return gone;

  const { changes } = db
    .update(transactions)
    .set({ ...(item ? { item } : {}), ...(categoryId !== null ? { categoryId } : {}) })
    .where(and(eq(transactions.id, target.id), isNotNull(transactions.importKey)))
    .run();
  if (changes !== 1) return gone;

  refreshAll();
  const what = item && categoryId !== null ? "description and category" : item ? "description" : "category";
  return {
    ok: true,
    message: `Used the bank's entry from ${shortDate(target.date)} (${formatRM(amount)}) and put your ${what} on it. Nothing was added twice.`,
    nonce: Date.now(),
  };
}

export async function deleteTransaction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;
  const db = await getDb();
  db.delete(transactions).where(eq(transactions.id, id)).run();
  refreshAll();
  // Deleting from the entry's own page can't stay there: go to where `next` says (a same-site path only).
  const next = safeBackPath(formData.get("next"));
  if (next) redirect(next);
}

export type DeleteResult = { ok: boolean; error?: string; /** The deleted row as an undo token (see `encodeUndo`), when there was one. */ undo?: string };

/**
 * Delete one entry and hand back what is needed to put it back. From the entry's own page (`next` given) it redirects there
 * with `?deleted=<token>` so the notice survives the page change; from a list it returns the token and stays where it is.
 * (`deleteTransaction` above is the plain version with no undo.)
 */
export async function deleteEntry(formData: FormData): Promise<DeleteResult> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Nothing to delete." };
  const db = await getDb();
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (row) db.delete(transactions).where(eq(transactions.id, id)).run();
  refreshAll();
  const undo = row ? encodeUndo(row) : undefined;
  const next = safeBackPath(formData.get("next"));
  if (next) redirect(undo ? withDeleted(next, undo) : next);
  return { ok: true, undo };
}

const Restore = z.object({
  id: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number().int().positive(),
  accountId: z.number().int().positive(),
  toAccountId: z.number().int().positive().nullish(),
  categoryId: z.number().int().positive().nullish(),
  item: z.string().max(120).nullish(),
  merchant: z.string().max(300).nullish(),
  note: z.string().max(500).nullish(),
  billId: z.number().int().positive().nullish(),
  shareId: z.number().int().positive().nullish(),
  importKey: z.string().max(200).nullish(),
  clientId: z.string().max(100).nullish(),
  importBatch: z.string().max(100).nullish(),
  sharePrevItem: z.string().max(500).nullish(),
  sharePrevCategoryId: z.number().int().positive().nullish(),
  createdAt: z.string().max(40),
});

/**
 * Undo a delete: put the row back from the token `deleteEntry` gave, with every column it had (its id, its bill or person, its
 * bank-import fingerprint, the phone's client id). It refuses when the id, the client id or the import fingerprint is already
 * taken, so it can never make a duplicate. A bill or person that has been deleted since is left unlinked rather than failing.
 */
export async function restoreTransaction(token: string): Promise<FormState> {
  const parsed = Restore.safeParse(decodeUndo(token));
  if (!parsed.success) return { ok: false, error: "That entry can't be restored (the undo information is not readable)." };
  const v = parsed.data;
  const db = await getDb();
  if (db.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, v.id)).get()) {
    return { ok: false, error: "That entry is already back, or its place has been used. Nothing was changed." };
  }
  if (v.clientId && db.select({ id: transactions.id }).from(transactions).where(eq(transactions.clientId, v.clientId)).get()) {
    return { ok: false, error: "An entry with the same phone id already exists. Nothing was restored." };
  }
  if (v.importKey && db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.accountId, v.accountId), eq(transactions.importKey, v.importKey))).get()) {
    return { ok: false, error: "The same bank line is already in your books (it may have been imported again). Nothing was restored." };
  }
  const has = {
    account: (id: number | null | undefined) => (id ? Boolean(db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id)).get()) : false),
    category: (id: number | null | undefined) => (id ? Boolean(db.select({ id: categories.id }).from(categories).where(eq(categories.id, id)).get()) : false),
    bill: (id: number | null | undefined) => (id ? Boolean(db.select({ id: recurringBills.id }).from(recurringBills).where(eq(recurringBills.id, id)).get()) : false),
    share: (id: number | null | undefined) => (id ? Boolean(db.select({ id: billShares.id }).from(billShares).where(eq(billShares.id, id)).get()) : false),
  };
  // The token comes from the browser: judge it by the same rules as a new entry (a real date, an amount within the ceiling),
  // and never restore a category of the wrong kind for the entry's type.
  if (!isRealDate(v.date)) return { ok: false, error: "That entry's date isn't valid, so it can't be restored." };
  if (!withinLimit(v.amount)) return { ok: false, error: MAX_AMOUNT_MESSAGE };
  const restoredCategory = v.categoryId ? db.select({ id: categories.id, type: categories.type }).from(categories).where(eq(categories.id, v.categoryId)).get() : undefined;
  const categoryFits = restoredCategory && (v.type === "transfer" ? false : restoredCategory.type === v.type);
  if (!has.account(v.accountId)) return { ok: false, error: "The account this entry was in no longer exists, so it can't be restored." };
  if (v.type === "transfer" && (!has.account(v.toAccountId) || v.toAccountId === v.accountId)) {
    return { ok: false, error: "The account this transfer went to no longer exists, so it can't be restored." };
  }
  db.insert(transactions)
    .values({
      id: v.id,
      date: v.date,
      type: v.type,
      amount: v.amount,
      accountId: v.accountId,
      toAccountId: v.type === "transfer" ? (v.toAccountId ?? null) : null,
      categoryId: categoryFits && has.category(v.categoryId) ? (v.categoryId ?? null) : null,
      item: v.item ?? null,
      merchant: v.merchant ?? null,
      note: v.note ?? null,
      billId: has.bill(v.billId) ? (v.billId ?? null) : null,
      shareId: has.share(v.shareId) ? (v.shareId ?? null) : null,
      importKey: v.importKey ?? null,
      clientId: v.clientId ?? null,
      importBatch: v.importBatch ?? null,
      sharePrevItem: v.sharePrevItem ?? null,
      sharePrevCategoryId: v.sharePrevCategoryId ?? null,
      createdAt: v.createdAt,
    })
    .run();
  refreshAll();
  return { ok: true, message: "Entry restored.", nonce: Date.now() };
}

export type BulkResult = {
  ok: boolean;
  /** How many entries were changed or deleted. */
  changed: number;
  error?: string;
  message?: string;
  /** How many selected entries are tied to a bill, person or import and need an explicit yes (`confirmLinked`). */
  needsConfirm?: number;
};

const bulkColumns = {
  id: transactions.id,
  type: transactions.type,
  amount: transactions.amount,
  billId: transactions.billId,
  shareId: transactions.shareId,
  importKey: transactions.importKey,
  importBatch: transactions.importBatch,
};

const refused = (v: Extract<BulkVerdict, { ok: false }>): BulkResult => ({ ok: false, changed: 0, error: v.error, needsConfirm: v.needsConfirm });

/**
 * Put one category on many entries. All or nothing in one transaction, up to 200 entries; returns how many changed. It refuses
 * a selection that mixes income and spending, a category of the wrong kind, any transfer, and (without `confirmLinked`) any
 * entry tied to a bill, a person or a bank import.
 */
export async function bulkSetCategory(rawIds: number[], categoryId: number, confirmLinked = false): Promise<BulkResult> {
  const ids = cleanIds(rawIds);
  if (ids.length > BULK_MAX) return refused(planSetCategory(ids, [], null, false) as Extract<BulkVerdict, { ok: false }>);
  const db = await getDb();
  const result = db.transaction((tx): BulkResult => {
    const rows: BulkRow[] = ids.length ? tx.select(bulkColumns).from(transactions).where(inArray(transactions.id, ids)).all() : [];
    const category = Number.isInteger(categoryId) ? tx.select().from(categories).where(eq(categories.id, categoryId)).get() : undefined;
    const verdict = planSetCategory(ids, rows, category ?? null, confirmLinked);
    if (!verdict.ok) return refused(verdict);
    const { changes } = tx.update(transactions).set({ categoryId }).where(inArray(transactions.id, ids)).run();
    return { ok: true, changed: changes, message: categorySetMessage(changes, category!.name) };
  });
  if (result.ok) refreshAll();
  return result;
}

/** Delete many entries at once (up to 200, one transaction). Entries tied to a bill, person or bank import need `confirmLinked`. */
export async function bulkDelete(rawIds: number[], confirmLinked = false): Promise<BulkResult> {
  const ids = cleanIds(rawIds);
  if (ids.length > BULK_MAX) return refused(planDelete(ids, [], false) as Extract<BulkVerdict, { ok: false }>);
  const db = await getDb();
  const result = db.transaction((tx): BulkResult => {
    const rows: BulkRow[] = ids.length ? tx.select(bulkColumns).from(transactions).where(inArray(transactions.id, ids)).all() : [];
    const verdict = planDelete(ids, rows, confirmLinked);
    if (!verdict.ok) return refused(verdict);
    const { changes } = tx.delete(transactions).where(inArray(transactions.id, ids)).run();
    return { ok: true, changed: changes, message: bulkDeletedMessage(changes) };
  });
  if (result.ok) refreshAll();
  return result;
}
