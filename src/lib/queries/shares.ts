import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { DB } from "@/db/open";
import { billShares, billTurns, categories, recurringBills, transactions } from "@/db/schema";
import { shiftDays } from "@/lib/dates";
import { billedMonths, pickShare, rotationBill, rotationLedger, SHARE_CANDIDATE_CATEGORIES, sharedBill, type ShareDef, type SharedBill, type SharePayment, type TurnSlot } from "@/lib/plan/shares";

export type ShareRow = ShareDef & { billName: string; sortOrder: number };

/** Every person who shares a bill with you, by bill. Takes the db so the importer (not a request) can use it too. */
export function selectShares(db: DB): ShareRow[] {
  return db
    .select({
      id: billShares.id,
      billId: billShares.billId,
      name: billShares.name,
      share: billShares.share,
      startMonth: billShares.startMonth,
      endMonth: billShares.endMonth,
      matchKeywords: billShares.matchKeywords,
      active: billShares.active,
      sortOrder: billShares.sortOrder,
      billName: recurringBills.name,
    })
    .from(billShares)
    .innerJoin(recurringBills, eq(billShares.billId, recurringBills.id))
    .orderBy(asc(billShares.billId), asc(billShares.sortOrder), asc(billShares.id))
    .all();
}

export async function listShares(): Promise<ShareRow[]> {
  return selectShares(await getDb());
}

/** The most months anyone is likely to pay in one go (a year). Larger sums are not offered as a share payment. */
const MAX_MONTHS_PREPAID = 12;

export type SharedBillView = SharedBill<{ id: number; name: string; amount: number; sharing: "monthly" | "turns" }>;

/** Money in that looks like it could be someone's payment but isn't linked to anyone yet. */
export type UnassignedCredit = { id: number; date: string; amount: number; description: string; suggestedShareId: number | null };

export type SharesPage = {
  bills: SharedBillView[];
  unassigned: UnassignedCredit[];
  /** Everyone, to choose from when assigning a payment. */
  people: ShareRow[];
  /** Sen others owe you across every shared bill. */
  owedToYou: number;
};



export async function getSharedBills(today: string): Promise<SharesPage> {
  const db = await getDb();
  const people = selectShares(db);
  const bills: SharedBillView[] = [];

  for (const billId of [...new Set(people.map((p) => p.billId))]) {
    const group = people.filter((p) => p.billId === billId);
    const bill = db.select().from(recurringBills).where(eq(recurringBills.id, billId)).get()!;
    // The months the bill was really charged: payments linked to it, or typed by its name.
    const charges = db
      .select({ date: transactions.date, amount: transactions.amount })
      .from(transactions)
      .where(and(eq(transactions.type, "expense"), lte(transactions.date, today), or(eq(transactions.billId, billId), eq(transactions.item, bill.name))))
      .orderBy(asc(transactions.date))
      .all();
    const payments: SharePayment[] = db
      .select({ shareId: transactions.shareId, txId: transactions.id, date: transactions.date, amount: transactions.amount })
      .from(transactions)
      .where(and(eq(transactions.type, "income"), inArray(transactions.shareId, group.map((g) => g.id))))
      .all()
      .map((p) => ({ ...p, shareId: p.shareId! }));
    const amount = Math.round((bill.amountMin + bill.amountMax) / 2);
    const header = { id: bill.id, name: bill.name, amount, sharing: bill.sharing };
    if (bill.sharing === "turns") {
      // One person pays the whole month: a turn costs what the bill was charged that month (or its usual amount).
      const schedule: TurnSlot[] = db.select().from(billTurns).where(eq(billTurns.billId, billId)).all().map((t) => ({ month: t.month, who: t.shareId ?? "you" }));
      const charged = new Map(charges.map((c) => [c.date.slice(0, 7), c.amount]));
      bills.push(rotationBill(header, amount, rotationLedger({ schedule, defs: group, payments, dueFor: (month) => charged.get(month) ?? amount, today, charged: [...charged.keys()] })));
    } else {
      bills.push(sharedBill(header, amount, billedMonths(charges.map((c) => c.date)), group, payments));
    }
  }

  const rows = db
    .select({ id: transactions.id, date: transactions.date, amount: transactions.amount, note: transactions.note, item: transactions.item })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.type, "income"), isNull(transactions.shareId), inArray(categories.name, SHARE_CANDIDATE_CATEGORIES)))
    .orderBy(asc(transactions.date))
    .all()
    .filter((r) => r.date >= shiftDays(today, -400));
  // A friend's payment is at least one month of the smallest share and at most about a year of the largest. Anything outside
  // that (a KWSP credit, a RM 3,000 transfer) can't be one, so it isn't offered.
  const active = people.filter((p) => p.active && p.share > 0);
  const lo = Math.min(...active.map((p) => p.share));
  const hi = Math.max(...active.map((p) => p.share)) * MAX_MONTHS_PREPAID;
  const unassigned = rows
    .filter((r) => active.length > 0 && r.amount >= lo && r.amount <= hi)
    .map((r) => {
      const matchText = [r.note, r.item].filter(Boolean).join(" ");
      return { id: r.id, date: r.date, amount: r.amount, description: r.note ?? r.item ?? "", suggestedShareId: pickShare(people, matchText, r.amount)?.id ?? null };
    })
    .reverse(); // newest first
  // Where the app can already tell who it is from, show that first: those are one tap each.
  unassigned.sort((a, b) => Number(b.suggestedShareId !== null) - Number(a.suggestedShareId !== null));

  return { bills, unassigned, people, owedToYou: bills.reduce((s, b) => s + b.owedToYou, 0) };
}
