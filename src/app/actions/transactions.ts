"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { accounts, categories, transactions } from "@/db/schema";
import { parseSen } from "@/lib/money";

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

export async function deleteTransaction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;
  const db = await getDb();
  db.delete(transactions).where(eq(transactions.id, id)).run();
  refreshAll();
}
