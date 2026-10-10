"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { accounts, categories, transactions } from "@/db/schema";
import { shortDate } from "@/lib/dates";
import { formatRM, parseSen } from "@/lib/money";
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
  if (amount === null || amount <= 0) return { ok: false, error: "Enter an amount greater than 0" };

  const db = await getDb();
  const accountId = Number(v.accountId);
  if (!db.select().from(accounts).where(eq(accounts.id, accountId)).get()) {
    return { ok: false, error: "That account no longer exists" };
  }

  let toAccountId: number | null = null;
  let categoryId: number | null = null;
  if (v.type === "transfer") {
    toAccountId = Number(v.toAccountId);
    if (!toAccountId) return { ok: false, error: "Pick the account the money goes to" };
    if (toAccountId === accountId) return { ok: false, error: "From and To accounts must differ" };
  } else {
    categoryId = Number(v.categoryId);
    if (!categoryId) return { ok: false, error: "Pick a category" };
    const cat = db.select().from(categories).where(eq(categories.id, categoryId)).get();
    if (!cat || cat.type !== v.type) return { ok: false, error: "Category doesn't match the entry type" };
  }

  const row = {
    date: v.date,
    type: v.type,
    amount,
    accountId,
    toAccountId,
    categoryId,
    item: v.item?.trim() || null,
    note: v.note?.trim() || null,
  };

  if (v.id) {
    db.update(transactions).set(row).where(eq(transactions.id, Number(v.id))).run();
    refreshAll();
    redirect("/transactions");
  }
  db.insert(transactions).values(row).run();
  refreshAll();
  return { ok: true, message: "Saved", nonce: Date.now() };
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
  if (amount === null || amount <= 0) return { ok: false, error: "Enter an amount greater than 0" };

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
}
