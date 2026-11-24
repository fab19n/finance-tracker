"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { accounts, billShares, billTurns, categories, importRules, recurringBills, transactions } from "@/db/schema";
import { isRealDate } from "@/lib/dates";
import { MAX_AMOUNT_MESSAGE, withinLimit } from "@/lib/limits";
import { parseSen } from "@/lib/money";
import { ALREADY_RECORDED } from "@/lib/plan/messages";
import { accountParam, savedParams, withParams, type SavedKey } from "@/lib/saved-notice";
import { getRoleAccounts } from "@/lib/queries/plan";

const DATE = z.string().refine((s) => isRealDate(s), "Pick a valid date");

/** Back to `to` with either the error to show or the "Saved" notice (see src/lib/saved-notice.ts). */
function done(to: string, error?: string, saved?: SavedKey): never {
  revalidatePath("/", "layout");
  redirect(withParams(to, error ? { error } : saved ? savedParams(saved) : {}));
}

/** The page a form came from, keeping the Plan's one-account filter (?account=) that the form carried in a hidden field. */
const returnTo = (base: string, formData: FormData) => withParams(base, { account: accountParam(formData.get("account")) });

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
  const back = returnTo("/plan/bills", formData);
  const p = BillInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(back, p.error.issues[0]?.message);
  const v = p.data!;

  const min = parseSen(v.amountMin);
  if (min === null || min <= 0) done(back, "Enter the bill's amount, e.g. 88.90");
  const max = v.amountMax?.trim() ? parseSen(v.amountMax) : min;
  if (max === null || max! < min!) done(back, "The 'up to' amount can't be less than the amount");
  if (!withinLimit(min!) || !withinLimit(max!)) done(back, MAX_AMOUNT_MESSAGE);

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
  done(back, undefined, "bill");
}

/** Delete a bill. Payments already recorded stay (as ordinary spending); they just stop being linked. */
export async function deleteBill(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const back = returnTo("/plan/bills", formData);
  if (!id) done(back);
  const db = await getDb();
  // One transaction: a failure part-way (a constraint, a killed process) leaves the bill and its links as they were.
  db.transaction((tx) => {
    tx.update(transactions).set({ billId: null }).where(eq(transactions.billId, id)).run();
    // People sharing this bill go with it; money they sent stays, just no longer counted towards anyone.
    const shareIds = tx.select({ id: billShares.id }).from(billShares).where(eq(billShares.billId, id)).all().map((s) => s.id);
    tx.delete(billTurns).where(eq(billTurns.billId, id)).run();
    if (shareIds.length) {
      tx.update(transactions).set({ shareId: null }).where(inArray(transactions.shareId, shareIds)).run();
      tx.delete(billShares).where(eq(billShares.billId, id)).run();
    }
    tx.delete(importRules).where(eq(importRules.billId, id)).run();
    tx.delete(recurringBills).where(eq(recurringBills.id, id)).run();
  });
  done(back, undefined, "billDeleted");
}

/**
 * "Made in the last minute": the double-tap guards below only refuse a twin that was recorded moments ago (a double tap, or
 * a retry after a lost reply). A genuine second payment of the same amount on the same day, recorded later, still goes through.
 */
const justNow = () => sql`${transactions.createdAt} >= datetime('now', '-60 seconds')`;

const PayInput = z.object({ billId: z.string().min(1), amount: z.string(), date: DATE });

/** "Mark paid": records the payment as spending from the bill's account and links it to the bill. */
export async function payBill(formData: FormData): Promise<void> {
  const back = returnTo("/plan", formData);
  const p = PayInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(back, p.error.issues[0]?.message);
  const amount = parseSen(p.data!.amount);
  if (amount === null || amount <= 0) done(back, "Enter the amount you paid");
  if (!withinLimit(amount!)) done(back, MAX_AMOUNT_MESSAGE);
  const db = await getDb();
  const bill = db.select().from(recurringBills).where(eq(recurringBills.id, Number(p.data!.billId))).get();
  if (!bill) done(back, "That bill no longer exists");
  // A double tap (or a retry after a lost reply) sends the same bill, day and amount twice: record it once.
  const twin = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.billId, bill!.id), eq(transactions.date, p.data!.date), eq(transactions.amount, amount!), eq(transactions.type, "expense"), justNow()))
    .get();
  if (twin) done(back, ALREADY_RECORDED);
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
  done(back, undefined, "billPaid");
}

const SalaryInput = z.object({ amount: z.string(), date: DATE });

/** Record this month's salary into the spending account. This is what starts a new pay cycle. */
export async function recordSalary(formData: FormData): Promise<void> {
  const back = returnTo("/plan", formData);
  const p = SalaryInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(back, p.error.issues[0]?.message);
  const amount = parseSen(p.data!.amount);
  if (amount === null || amount <= 0) done(back, "Enter your take-home pay, e.g. 5,400");
  if (!withinLimit(amount!)) done(back, MAX_AMOUNT_MESSAGE);
  const { spending } = await getRoleAccounts();
  if (!spending) done(back, "Choose your spending account in Settings first");
  const db = await getDb();
  // Pay cycles are cut from income in the category NAMED "Salary", so without it the payday would be recorded and
  // then never start a cycle. Refuse with the way out rather than saving an entry the Plan can't see.
  const salary = db.select().from(categories).where(eq(categories.name, "Salary")).get();
  if (!salary || salary.archived || salary.type !== "income") {
    done(back, 'Salary needs an income category named "Salary". Add or restore it in Settings > Categories, then record the pay again');
  }
  const twin = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "income"),
        eq(transactions.accountId, spending!.id),
        eq(transactions.categoryId, salary!.id),
        eq(transactions.date, p.data!.date),
        eq(transactions.amount, amount!),
        justNow(),
      ),
    )
    .get();
  if (twin) done(back, ALREADY_RECORDED);
  db.insert(transactions)
    .values({ date: p.data!.date, type: "income", amount: amount!, accountId: spending!.id, categoryId: salary!.id, item: "Salary" })
    .run();
  done(back, undefined, "salary");
}

const PaydayTransferInput = z.object({ amount: z.string(), date: DATE });

/** Record the one payday transfer from the spending account to savings. */
export async function recordPaydayTransfer(formData: FormData): Promise<void> {
  const back = returnTo("/plan", formData);
  const p = PaydayTransferInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(back, p.error.issues[0]?.message);
  const amount = parseSen(p.data!.amount);
  if (amount === null || amount <= 0) done(back, "Enter the amount you moved to savings");
  if (!withinLimit(amount!)) done(back, MAX_AMOUNT_MESSAGE);
  const { spending, savings } = await getRoleAccounts();
  if (!spending || !savings) done(back, "Choose your spending and savings accounts in Settings first");
  const db = await getDb();
  const twin = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "transfer"),
        eq(transactions.accountId, spending!.id),
        eq(transactions.toAccountId, savings!.id),
        eq(transactions.date, p.data!.date),
        eq(transactions.amount, amount!),
        justNow(),
      ),
    )
    .get();
  if (twin) done(back, ALREADY_RECORDED);
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
  done(back, undefined, "paydayTransfer");
}
