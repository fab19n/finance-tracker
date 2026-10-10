"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { DB } from "@/db/open";
import { billShares, billTurns, categories, recurringBills, transactions } from "@/db/schema";
import { parseSen } from "@/lib/money";
import { pickShare, SHARE_CANDIDATE_CATEGORIES } from "@/lib/plan/shares";
import { selectShares } from "@/lib/queries/shares";

const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a valid month");
const BACK = "/plan/shared";

function done(error?: string, linked?: number): never {
  revalidatePath("/", "layout");
  const q = error ? `?error=${encodeURIComponent(error)}` : linked ? `?linked=${linked}` : "";
  redirect(`${BACK}${q}`);
}

/** File a received payment under the person who sent it: it counts towards their months, and is "Reimbursements". */
function claim(db: DB, txId: number, share: { id: number; billName: string }): void {
  const reimb = db.select().from(categories).where(eq(categories.name, "Reimbursements")).get();
  const tx = db.select().from(transactions).where(eq(transactions.id, txId)).get();
  if (!tx) return;
  // A salary or interest line stays what it is; only the vague money-in categories are re-filed.
  const refile = reimb && tx.categoryId && db.select().from(categories).where(eq(categories.id, tx.categoryId)).get();
  const vague = refile && SHARE_CANDIDATE_CATEGORIES.includes(refile.name);
  db.update(transactions)
    .set({ shareId: share.id, ...(vague ? { categoryId: reimb!.id } : {}), item: `${share.billName} share` })
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
  share: z.string(),
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

  const share = parseSen(v.share);
  if (share === null || share <= 0) done("Enter what they owe each month, e.g. 22.25");
  let endMonth: string | null = null;
  if (v.endMonth?.trim()) {
    if (!MONTH.safeParse(v.endMonth).success) done("Pick a valid 'until' month, or leave it blank");
    if (v.endMonth < v.startMonth) done("They can't leave before they joined");
    endMonth = v.endMonth;
  }

  const db = await getDb();
  const bill = db.select().from(recurringBills).where(eq(recurringBills.id, Number(v.billId))).get();
  if (!bill) done("That bill no longer exists");

  const row = {
    billId: bill!.id,
    name: v.name,
    share: share!,
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
  let id: number;
  if (v.id) {
    id = Number(v.id);
    db.update(billShares).set(row).where(eq(billShares.id, id)).run();
  } else {
    id = db.insert(billShares).values({ ...row, sortOrder: 999 }).returning().get().id;
  }
  done(undefined, linkPastPayments(db, id));
}

/** Remove someone from a plan. Money they sent stays in your records, just no longer counted towards them. */
export async function deleteShare(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) done();
  const db = await getDb();
  db.update(transactions).set({ shareId: null }).where(eq(transactions.shareId, id)).run();
  // Their turns on a rotation go with them (those months are nobody's until you plan them again).
  db.delete(billTurns).where(eq(billTurns.shareId, id)).run();
  db.delete(billShares).where(eq(billShares.id, id)).run();
  done();
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
  db.update(recurringBills).set({ sharing: p.data!.sharing }).where(eq(recurringBills.id, bill!.id)).run();
  if (p.data!.sharing === "turns") db.update(billShares).set({ share: Math.round((bill!.amountMin + bill!.amountMax) / 2) }).where(eq(billShares.billId, bill!.id)).run();
  done();
}

const CoverInput = z.object({ billId: z.string().min(1), shareId: z.string().min(1, "Choose who covered it"), month: MONTH });

/**
 * "Rakeesh covered October": give that person the month. Months are claimed when someone volunteers (not in the order
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
  done();
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
  done();
}

const AssignInput = z.object({ txId: z.string().min(1), shareId: z.string().min(1, "Choose who it is from") });

/** "This RM 66.75 was Kuganesh paying for Netflix": count it towards their months. */
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
  done();
}

/** Undo an assignment (it stays recorded as money in). */
export async function unassignPayment(formData: FormData): Promise<void> {
  const txId = Number(formData.get("txId"));
  if (!txId) done();
  const db = await getDb();
  db.update(transactions).set({ shareId: null }).where(eq(transactions.id, txId)).run();
  done();
}
