"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { DB } from "@/db/open";
import { accounts, billShares, billTurns, categories, recurringBills, transactions } from "@/db/schema";
import { isRealDate } from "@/lib/dates";
import { MAX_AMOUNT_MESSAGE, withinLimit } from "@/lib/limits";
import { parseSen } from "@/lib/money";
import { ALREADY_RECORDED } from "@/lib/plan/messages";
import { pickShare, SHARE_CANDIDATE_CATEGORIES } from "@/lib/plan/shares";
import { selectShares } from "@/lib/queries/shares";
import { withParams, type SavedKey } from "@/lib/saved-notice";

const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a valid month");
const BACK = "/plan/shared";

function done(error?: string, linked?: number, saved?: SavedKey): never {
  revalidatePath("/", "layout");
  redirect(withParams(BACK, error ? { error } : linked ? { linked: String(linked) } : saved ? { saved } : {}));
}

/** File a received payment under the person who sent it: it counts towards their months, and is "Reimbursements". */
function claim(db: DB, txId: number, share: { id: number; billName: string }): void {
  const reimb = db.select().from(categories).where(eq(categories.name, "Reimbursements")).get();
  const tx = db.select().from(transactions).where(eq(transactions.id, txId)).get();
  if (!tx) return;
  // A salary or interest line stays what it is; only the vague money-in categories are re-filed.
  const refile = reimb && tx.categoryId && db.select().from(categories).where(eq(categories.id, tx.categoryId)).get();
  const vague = refile && SHARE_CANDIDATE_CATEGORIES.includes(refile.name);
  // Counting rewrites the item and may move the category: keep what it was (once) so "Not theirs" can put it back.
  const keep = tx.sharePrevItem === null && tx.sharePrevCategoryId === null ? { sharePrevItem: tx.item, sharePrevCategoryId: tx.categoryId } : {};
  db.update(transactions)
    .set({ shareId: share.id, ...(vague ? { categoryId: reimb!.id } : {}), item: `${share.billName} share`, ...keep })
    .where(eq(transactions.id, txId))
    .run();
}

/** Link every unassigned money-in that clearly came from this person (their words on the line, a whole-month amount). */
function linkPastPayments(db: DB, shareId: number): number {
  const people = selectShares(db);
  const me = people.find((p) => p.id === shareId);
  if (!me) return 0;
  const candidates = db
    .select({ id: transactions.id, amount: transactions.amount, note: transactions.note, item: transactions.item })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.type, "income"), isNull(transactions.shareId), inArray(categories.name, SHARE_CANDIDATE_CATEGORIES)))
    .all();
  let n = 0;
  for (const c of candidates) {
    const description = [c.note, c.item].filter(Boolean).join(" ");
    if (pickShare(people, description, c.amount)?.id !== shareId) continue;
    claim(db, c.id, me);
    n++;
  }
  return n;
}

const ShareInput = z.object({
  id: z.string().optional(),
  billId: z.string().min(1, "Choose which bill is shared"),
  name: z.string().trim().min(1, "Enter the person's name").max(60),
  // Not sent for a bill paid in turns: a turn is the whole month, which the app fills in.
  share: z.string().optional(),
  startMonth: MONTH,
  endMonth: z.string().optional(),
  matchKeywords: z.string().max(200).optional(),
  active: z.string().optional(), // a ticked checkbox sends a value; unticked sends nothing
});

/** Add or edit someone who shares a bill. Any money already received that is clearly theirs is linked straight away. */
export async function saveShare(formData: FormData): Promise<void> {
  const p = ShareInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(p.error.issues[0]?.message);
  const v = p.data!;

  let endMonth: string | null = null;
  if (v.endMonth?.trim()) {
    if (!MONTH.safeParse(v.endMonth).success) done("Pick a valid 'until' month, or leave it blank");
    if (v.endMonth < v.startMonth) done("They can't leave before they joined");
    endMonth = v.endMonth;
  }

  const db = await getDb();
  const bill = db.select().from(recurringBills).where(eq(recurringBills.id, Number(v.billId))).get();
  if (!bill) done("That bill no longer exists");

  // A part of the month is only asked for on a bill split in equal parts.
  const share = bill!.sharing === "turns" ? 0 : parseSen(v.share ?? "");
  if (share === null || (bill!.sharing !== "turns" && share <= 0)) done("Enter what they owe each month, e.g. 22.25");
  if (!withinLimit(share!)) done(MAX_AMOUNT_MESSAGE);

  // On a bill paid in turns one person pays the WHOLE month, so what a payment from them is expected to be is the
  // bill's usual amount whatever was typed (the same figure setSharing uses); a typed part would be stored as a
  // monthly share the rotation maths never expects.
  const turnShare = Math.round((bill!.amountMin + bill!.amountMax) / 2);
  const row = {
    billId: bill!.id,
    name: v.name,
    share: bill!.sharing === "turns" ? turnShare : share!,
    startMonth: v.startMonth,
    endMonth,
    matchKeywords:
      v.matchKeywords
        ?.split(",")
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean)
        .join(", ") || null,
    active: !!v.active,
  };
  // The person and the payments re-filed to them are written together, or not at all.
  let linked = 0;
  let missing = false;
  db.transaction(() => {
    let id: number;
    if (v.id) {
      id = Number(v.id);
      if (!db.select({ id: billShares.id }).from(billShares).where(eq(billShares.id, id)).get()) {
        missing = true;
        return;
      }
      db.update(billShares).set(row).where(eq(billShares.id, id)).run();
    } else {
      id = db.insert(billShares).values({ ...row, sortOrder: 999 }).returning().get().id;
    }
    linked = linkPastPayments(db, id);
  });
  if (missing) done("That person is no longer on a shared bill");
  done(undefined, linked, "person");
}

/** Remove someone from a plan. Money they sent stays in your records, just no longer counted towards them. */
export async function deleteShare(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) done();
  const db = await getDb();
  db.transaction((tx) => {
    tx.update(transactions).set({ shareId: null }).where(eq(transactions.shareId, id)).run();
    // Their turns on a rotation go with them (those months are nobody's until you plan them again).
    tx.delete(billTurns).where(eq(billTurns.shareId, id)).run();
    tx.delete(billShares).where(eq(billShares.id, id)).run();
  });
  done(undefined, undefined, "personRemoved");
}

const SharingInput = z.object({ billId: z.string().min(1), sharing: z.enum(["monthly", "turns"], { message: "Choose how the bill is split" }) });

/**
 * How a shared bill is split: an equal part of every month ("monthly", Netflix) or one person paying the whole month
 * in turn ("turns", Spotify). Switching to turns makes each person's amount the bill's usual amount: a turn costs the
 * whole month, and that is what a payment from them is expected to be.
 */
export async function setSharing(formData: FormData): Promise<void> {
  const p = SharingInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(p.error.issues[0]?.message);
  const db = await getDb();
  const bill = db.select().from(recurringBills).where(eq(recurringBills.id, Number(p.data!.billId))).get();
  if (!bill) done("That bill no longer exists");
  db.transaction((tx) => {
    tx.update(recurringBills).set({ sharing: p.data!.sharing }).where(eq(recurringBills.id, bill!.id)).run();
    if (p.data!.sharing === "turns") tx.update(billShares).set({ share: Math.round((bill!.amountMin + bill!.amountMax) / 2) }).where(eq(billShares.billId, bill!.id)).run();
  });
  done(undefined, undefined, "split");
}

const CoverInput = z.object({ billId: z.string().min(1), shareId: z.string().min(1, "Choose who covered it"), month: MONTH });

/**
 * "Friend A covered October": give that person the month. Months are claimed when someone volunteers (not in the order
 * people pay, and not in a fixed order), so this is one tap from the money that has arrived. Refuses a month somebody
 * already has: changing a month is the planner's job.
 */
export async function coverMonth(formData: FormData): Promise<void> {
  const p = CoverInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(p.error.issues[0]?.message);
  const billId = Number(p.data!.billId);
  const shareId = Number(p.data!.shareId);
  const db = await getDb();
  const who = db.select().from(billShares).where(and(eq(billShares.id, shareId), eq(billShares.billId, billId))).get();
  if (!who) done("That person isn't on this bill");
  const taken = db.select().from(billTurns).where(and(eq(billTurns.billId, billId), eq(billTurns.month, p.data!.month))).get();
  if (taken) done("Somebody already has that month");
  db.insert(billTurns).values({ billId, month: p.data!.month, shareId }).run();
  done(undefined, undefined, "monthCovered");
}

/**
 * Save whose turn it is, month by month. The form sends one field per month, `turn:YYYY-MM`, holding "you", a
 * person's id, or nothing (nobody yet). Only the months it names are touched.
 */
export async function saveTurns(formData: FormData): Promise<void> {
  const billId = Number(formData.get("billId"));
  if (!billId) done("Choose which bill");
  const db = await getDb();
  const bill = db.select().from(recurringBills).where(eq(recurringBills.id, billId)).get();
  if (!bill) done("That bill no longer exists");
  const people = new Set(db.select({ id: billShares.id }).from(billShares).where(eq(billShares.billId, billId)).all().map((s) => s.id));

  const plan: { month: string; shareId: number | null }[] = [];
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("turn:")) continue;
    const month = key.slice(5);
    if (!MONTH.safeParse(month).success) done("Pick valid months");
    const value = String(raw).trim();
    if (value === "") plan.push({ month, shareId: -1 }); // nobody: clear the month
    else if (value === "you") plan.push({ month, shareId: null });
    else if (people.has(Number(value))) plan.push({ month, shareId: Number(value) });
    else done("That person isn't on this bill");
  }
  db.transaction((tx) => {
    for (const { month, shareId } of plan) {
      tx.delete(billTurns).where(and(eq(billTurns.billId, billId), eq(billTurns.month, month))).run();
      if (shareId !== -1) tx.insert(billTurns).values({ billId, month, shareId }).run();
    }
  });
  done(undefined, undefined, "turns");
}

const AssignInput = z.object({ txId: z.string().min(1), shareId: z.string().min(1, "Choose who it is from") });

/** "This RM 66.75 was Friend paying for Netflix": count it towards their months. */
export async function assignPayment(formData: FormData): Promise<void> {
  const p = AssignInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(p.error.issues[0]?.message);
  const db = await getDb();
  const tx = db.select().from(transactions).where(eq(transactions.id, Number(p.data!.txId))).get();
  if (!tx || tx.type !== "income") done("That isn't a money-in entry");
  const people = selectShares(db);
  const who = people.find((s) => s.id === Number(p.data!.shareId));
  if (!who) done("Choose who it is from");
  claim(db, tx!.id, who!);
  done(undefined, undefined, "counted");
}

/**
 * "Not theirs": undo an assignment. The entry stays recorded as money in, with the item and category it had before it was
 * counted (when they were saved). An entry that was never counted towards anybody is left exactly as it is.
 */
export async function unassignPayment(formData: FormData): Promise<void> {
  const txId = Number(formData.get("txId"));
  if (!txId) done();
  const db = await getDb();
  db.transaction((t) => {
    const row = t.select().from(transactions).where(eq(transactions.id, txId)).get();
    if (!row || row.shareId === null) return;
    const prevCategory = row.sharePrevCategoryId === null ? undefined : t.select({ id: categories.id }).from(categories).where(eq(categories.id, row.sharePrevCategoryId)).get();
    // Put back only what COUNTING changed: an item or category the user has edited since is theirs and stays as it is.
    const nowCategory = row.categoryId === null ? undefined : t.select({ name: categories.name }).from(categories).where(eq(categories.id, row.categoryId)).get();
    const itemStillCounted = / share$/.test(row.item ?? "");
    const categoryStillCounted = nowCategory?.name === "Reimbursements";
    t.update(transactions)
      .set({
        shareId: null,
        ...(row.sharePrevItem !== null && itemStillCounted ? { item: row.sharePrevItem } : {}),
        ...(prevCategory && categoryStillCounted ? { categoryId: prevCategory.id } : {}),
        sharePrevItem: null,
        sharePrevCategoryId: null,
      })
      .where(eq(transactions.id, txId))
      .run();
  });
  done();
}

const PayInput = z.object({
  shareId: z.string().min(1, "Choose who paid"),
  amount: z.string(),
  date: z.string().refine((s) => isRealDate(s), "Pick a valid date"),
  accountId: z.string().min(1, "Choose the account it went into"),
});

/** The same double-tap guard as paying a bill: a twin made in the last minute is a double tap or a retry, not a second payment. */
const justNow = () => sql`${transactions.createdAt} >= datetime('now', '-60 seconds')`;

/**
 * "Mark paid": this person paid their share. Records it as money in (category Reimbursements, linked to them) in one write,
 * so the ledger fills their oldest unpaid months at the price in force. No need to add it by hand first.
 */
export async function recordSharePayment(formData: FormData): Promise<void> {
  const p = PayInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(p.error.issues[0]?.message);
  const amount = parseSen(p.data!.amount);
  if (amount === null || amount <= 0) done("Enter the amount they paid");
  if (!withinLimit(amount!)) done(MAX_AMOUNT_MESSAGE);
  const db = await getDb();
  const who = selectShares(db).find((s) => s.id === Number(p.data!.shareId));
  if (!who) done("That person is no longer on a shared bill");
  if (!who!.active) done("They have left this bill: switch them back on in their settings to count a payment");
  const account = db.select().from(accounts).where(eq(accounts.id, Number(p.data!.accountId))).get();
  if (!account || account.archived) done("Choose the account it went into");
  if (account!.type === "investment") done("A friend's payment can't go into an investment account");
  const reimb = db.select().from(categories).where(eq(categories.name, "Reimbursements")).get();
  if (!reimb || reimb.type !== "income") done('This needs an income category named "Reimbursements". Add or restore it in Settings > Categories');

  const duplicate = db.transaction((t) => {
    const twin = t
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.shareId, who!.id), eq(transactions.type, "income"), eq(transactions.date, p.data!.date), eq(transactions.amount, amount!), eq(transactions.accountId, account!.id), justNow()))
      .get();
    if (twin) return true;
    t.insert(transactions)
      .values({ date: p.data!.date, type: "income", amount: amount!, accountId: account!.id, categoryId: reimb!.id, item: `${who!.billName} share`, shareId: who!.id })
      .run();
    return false;
  });
  if (duplicate) done(ALREADY_RECORDED);
  done(undefined, undefined, "counted");
}
