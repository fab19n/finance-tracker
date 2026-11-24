import { and, asc, desc, eq, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { DB } from "@/db/open";
import { accounts, billShares, billTurns, categories, recurringBills, transactions } from "@/db/schema";
import { splitClaims, type ClaimCredit } from "@/lib/plan/share-claims";
import { billedMonths, earlierShareAmounts, rotationBill, rotationLedger, SHARE_CANDIDATE_CATEGORIES, sharedBill, type ShareDef, type SharedBill, type SharePayment, type TurnSlot } from "@/lib/plan/shares";

export type ShareRow = ShareDef & {
  billName: string;
  sortOrder: number;
  /** What a month of this bill used to cost them, from what it was charged before a price change (see `pickShare`). */
  earlierShares: number[];
};

/** Every time the bill was charged: the payments linked to it, or typed by its name. `today` leaves out later-dated ones. */
function billCharges(db: DB, bill: { id: number; name: string }, today?: string): { date: string; amount: number }[] {
  return db
    .select({ date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .where(and(eq(transactions.type, "expense"), today ? lte(transactions.date, today) : undefined, or(eq(transactions.billId, bill.id), eq(transactions.item, bill.name))))
    .orderBy(asc(transactions.date))
    .all();
}

/** What the bill was charged in each 'YYYY-MM' (several charges in a month add up). */
function chargesByMonth(charges: { date: string; amount: number }[]): Map<string, number> {
  const byMonth = new Map<string, number>();
  for (const c of charges) byMonth.set(c.date.slice(0, 7), (byMonth.get(c.date.slice(0, 7)) ?? 0) + c.amount);
  return byMonth;
}

/** Every person who shares a bill with you, by bill. Takes the db so the importer (not a request) can use it too. */
export function selectShares(db: DB): ShareRow[] {
  const rows = db
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
      billMin: recurringBills.amountMin,
      billMax: recurringBills.amountMax,
    })
    .from(billShares)
    .innerJoin(recurringBills, eq(billShares.billId, recurringBills.id))
    .orderBy(asc(billShares.billId), asc(billShares.sortOrder), asc(billShares.id))
    .all();
  // A share that cost less before the bill's price rose: the amounts a lump of old-price months would add up from.
  const prices = new Map<number, { charges: Map<string, number>; typical: number }>();
  for (const r of rows) {
    if (!prices.has(r.billId)) prices.set(r.billId, { charges: chargesByMonth(billCharges(db, { id: r.billId, name: r.billName })), typical: Math.round((r.billMin + r.billMax) / 2) });
  }
  return rows.map((r) => ({
    id: r.id,
    billId: r.billId,
    name: r.name,
    share: r.share,
    startMonth: r.startMonth,
    endMonth: r.endMonth,
    matchKeywords: r.matchKeywords,
    active: r.active,
    sortOrder: r.sortOrder,
    billName: r.billName,
    earlierShares: earlierShareAmounts(r.share, prices.get(r.billId)!),
  }));
}

export async function listShares(): Promise<ShareRow[]> {
  return selectShares(await getDb());
}

export type SharedBillView = SharedBill<{ id: number; name: string; amount: number; sharing: "monthly" | "turns" }>;

/** Money in that looks like it could be someone's payment but isn't linked to anyone yet. */
export type UnassignedCredit = ClaimCredit;

/** A payment already counted towards somebody. */
export type CountedPayment = { txId: number; date: string; amount: number };

export type SharesPage = {
  bills: SharedBillView[];
  unassigned: UnassignedCredit[];
  /** Money in that is not a likely payment (an odd amount, an old entry): offered behind "Show all money in". */
  unassignedOther: UnassignedCredit[];
  /** Counted payments by person (`bill_shares.id`), newest first. */
  payments: Record<number, CountedPayment[]>;
  /** Accounts a payment can be recorded into (no investments). */
  accounts: { id: number; name: string }[];
  /** The Main (spending) account, else the first. */
  defaultAccountId: number | null;
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
    // The months the bill was really charged, and what each charge was: payments linked to it, or typed by its name.
    const charges = billCharges(db, bill, today);
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
      // Each month costs a person their part of what it was charged, so a price rise counts only from when it took effect.
      bills.push(sharedBill(header, amount, billedMonths(charges.map((c) => c.date)), group, payments, chargesByMonth(charges)));
    }
  }

  const rows = db
    .select({ id: transactions.id, date: transactions.date, amount: transactions.amount, note: transactions.note, item: transactions.item, categoryName: categories.name })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.type, "income"), isNull(transactions.shareId), inArray(categories.name, SHARE_CANDIDATE_CATEGORIES)))
    .all();
  // Reimbursements are always offered; other money in only when it is a plausible payment (see share-claims.ts).
  const { main: unassigned, other: unassignedOther } = splitClaims(rows, people, today);

  // Every counted payment, per person, newest first: the list that carries "Not theirs".
  const payments: Record<number, CountedPayment[]> = {};
  const counted = db
    .select({ shareId: transactions.shareId, id: transactions.id, date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .where(and(eq(transactions.type, "income"), inArray(transactions.shareId, people.length ? people.map((p) => p.id) : [-1])))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all();
  for (const c of counted) (payments[c.shareId!] ??= []).push({ txId: c.id, date: c.date, amount: c.amount });

  // Where a payment can be put: any open account except an investment; the Main (spending) account first.
  const accts = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.archived, false), ne(accounts.type, "investment")))
    .orderBy(asc(accounts.sortOrder), asc(accounts.id))
    .all();
  const defaultAccountId = (accts.find((a) => a.purpose === "spending") ?? accts[0])?.id ?? null;

  return { bills, unassigned, unassignedOther, payments, accounts: accts.map((a) => ({ id: a.id, name: a.name })), defaultAccountId, people, owedToYou: bills.reduce((s, b) => s + b.owedToYou, 0) };
}
