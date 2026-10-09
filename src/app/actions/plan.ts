"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { accounts, categories, importRules, recurringBills, transactions } from "@/db/schema";
import { parseSen } from "@/lib/money";
import { getRoleAccounts } from "@/lib/queries/plan";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

function done(to: string, error?: string): never {
  revalidatePath("/", "layout");
  redirect(error ? `${to}?error=${encodeURIComponent(error)}` : to);
}

const BillInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Give the bill a name").max(60),
  categoryId: z.string().min(1, "Pick a category"),
  accountId: z.string().min(1, "Pick the account it is paid from"),
  amountMin: z.string(),
  amountMax: z.string().optional(),
  dueDay: z.string().optional(),
  matchKeywords: z.string().max(200).optional(),
  active: z.string().optional(), // a ticked checkbox sends a value; unticked sends nothing
});

/** Create or update a recurring bill. A blank "up to" amount means the bill is a fixed amount. */
export async function saveBill(formData: FormData): Promise<void> {
  const back = "/plan/bills";
  const p = BillInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(back, p.error.issues[0]?.message);
  const v = p.data!;

  const min = parseSen(v.amountMin);
  if (min === null || min <= 0) done(back, "Enter the bill's amount, e.g. 88.90");
  const max = v.amountMax?.trim() ? parseSen(v.amountMax) : min;
  if (max === null || max! < min!) done(back, "The 'up to' amount can't be less than the amount");

  let dueDay: number | null = null;
  if (v.dueDay?.trim()) {
    dueDay = Number(v.dueDay);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) done(back, "Due day must be between 1 and 31");
  }

  const db = await getDb();
  const category = db.select().from(categories).where(eq(categories.id, Number(v.categoryId))).get();
  if (!category || category.type !== "expense") done(back, "Pick an expense category");
  const account = db.select().from(accounts).where(eq(accounts.id, Number(v.accountId))).get();
  if (!account || account.type === "investment") done(back, "Pick a bank, cash or e-wallet account");

  const row = {
    name: v.name,
    categoryId: Number(v.categoryId),
    accountId: Number(v.accountId),
    amountMin: min!,
    amountMax: max!,
    dueDay,
    matchKeywords:
      v.matchKeywords
        ?.split(",")
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean)
        .join(", ") || null,
    active: !!v.active,
  };
  if (v.id) db.update(recurringBills).set(row).where(eq(recurringBills.id, Number(v.id))).run();
  else db.insert(recurringBills).values({ ...row, sortOrder: 999 }).run();
  done(back);
}

/** Delete a bill. Payments already recorded stay (as ordinary spending); they just stop being linked. */
export async function deleteBill(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) done("/plan/bills");
  const db = await getDb();
  db.update(transactions).set({ billId: null }).where(eq(transactions.billId, id)).run();
  db.delete(importRules).where(eq(importRules.billId, id)).run();
  db.delete(recurringBills).where(eq(recurringBills.id, id)).run();
  done("/plan/bills");
}

const PayInput = z.object({ billId: z.string().min(1), amount: z.string(), date: DATE });

/** "Mark paid": records the payment as spending from the bill's account and links it to the bill. */
export async function payBill(formData: FormData): Promise<void> {
  const p = PayInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done("/plan", p.error.issues[0]?.message);
  const amount = parseSen(p.data!.amount);
  if (amount === null || amount <= 0) done("/plan", "Enter the amount you paid");
  const db = await getDb();
  const bill = db.select().from(recurringBills).where(eq(recurringBills.id, Number(p.data!.billId))).get();
  if (!bill) done("/plan", "That bill no longer exists");
  db.insert(transactions)
    .values({
      date: p.data!.date,
      type: "expense",
      amount: amount!,
      accountId: bill!.accountId,
      categoryId: bill!.categoryId,
      item: bill!.name,
      billId: bill!.id,
    })
    .run();
  done("/plan");
}

const SalaryInput = z.object({ amount: z.string(), date: DATE });

/** Record this month's salary into the spending account. This is what starts a new pay cycle. */
export async function recordSalary(formData: FormData): Promise<void> {
  const p = SalaryInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done("/plan", p.error.issues[0]?.message);
  const amount = parseSen(p.data!.amount);
  if (amount === null || amount <= 0) done("/plan", "Enter your take-home pay, e.g. 5,400");
  const { spending } = await getRoleAccounts();
  if (!spending) done("/plan", "Choose your spending account in Settings first");
  const db = await getDb();
  const salary = db.select().from(categories).where(eq(categories.name, "Salary")).get();
  db.insert(transactions)
    .values({ date: p.data!.date, type: "income", amount: amount!, accountId: spending!.id, categoryId: salary?.id ?? null, item: "Salary" })
    .run();
  done("/plan");
}

const PaydayTransferInput = z.object({ amount: z.string(), date: DATE });

/** Record the one payday transfer from the spending account to savings. */
export async function recordPaydayTransfer(formData: FormData): Promise<void> {
  const p = PaydayTransferInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done("/plan", p.error.issues[0]?.message);
  const amount = parseSen(p.data!.amount);
  if (amount === null || amount <= 0) done("/plan", "Enter the amount you moved to savings");
  const { spending, savings } = await getRoleAccounts();
  if (!spending || !savings) done("/plan", "Choose your spending and savings accounts in Settings first");
  const db = await getDb();
  db.insert(transactions)
    .values({
      date: p.data!.date,
      type: "transfer",
      amount: amount!,
      accountId: spending!.id,
      toAccountId: savings!.id,
      note: "Payday transfer to savings",
    })
    .run();
  done("/plan");
}
