import { daysBetween, shiftMonth } from "@/lib/dates";
import { clampDay, type Cycle } from "./cycle";

/**
 * Recurring bills, checked against a pay cycle. Pure: bills + transactions + today in, a checklist out.
 */

export type BillDef = {
  id: number;
  name: string;
  accountId: number;
  categoryId: number | null;
  nature: "need" | "want" | "saving";
  amountMin: number; // sen
  amountMax: number; // sen
  dueDay: number | null;
  matchKeywords: string | null;
  active: boolean;
};

export type BillTx = {
  id: number;
  date: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  accountId: number;
  item: string | null;
  billId: number | null;
};

export type BillStatus = "paid" | "overdue" | "due_soon" | "upcoming" | "unscheduled";

export type BillInCycle = {
  bill: BillDef;
  /** When it falls due in this cycle (null when no due day is set). */
  dueDate: string | null;
  daysUntilDue: number | null;
  status: BillStatus;
  paid: { txId: number; date: string; amount: number } | null;
  /** Typical amount (midpoint of the range). */
  expected: number;
  /** Money to hold back for it: its highest expected amount while unpaid, 0 once paid. */
  reserve: number;
  /** Paid, but outside its usual range (more than 10% above the top or below the bottom). */
  unusual: boolean;
};

const DUE_SOON_DAYS = 5;

/** Lowercase letters/digits only, single spaces: "Netflix  (Sep)" -> "netflix sep". */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export const billMidpoint = (b: Pick<BillDef, "amountMin" | "amountMax">) => Math.round((b.amountMin + b.amountMax) / 2);

/** The date within the cycle on which a bill with this due day falls (clamped for short months). */
export function dueDateInCycle(dueDay: number, cycle: Pick<Cycle, "start" | "end">): string {
  const startMonth = cycle.start.slice(0, 7);
  for (const month of [startMonth, shiftMonth(startMonth, 1)]) {
    const d = clampDay(month, dueDay);
    if (d >= cycle.start && d <= cycle.end) return d;
  }
  // A short cycle can skip a day-of-month entirely; the closest sensible answer is its last day.
  return cycle.end;
}

/** The payment that settles `bill` in this cycle: linked by id first, else an expense with the bill's name. */
export function findPayment(bill: BillDef, cycle: Pick<Cycle, "start" | "end">, txs: BillTx[]): BillTx | null {
  const inCycle = txs.filter((t) => t.type === "expense" && t.date >= cycle.start && t.date <= cycle.end);
  const linked = inCycle.find((t) => t.billId === bill.id);
  if (linked) return linked;
  const name = normalizeName(bill.name);
  return inCycle.find((t) => t.billId == null && normalizeName(t.item) === name) ?? null;
}

const RANK: Record<BillStatus, number> = { overdue: 0, due_soon: 1, upcoming: 2, unscheduled: 3, paid: 4 };

/** The checklist for one cycle: every active bill with its status, most urgent first. */
export function evaluateBills(bills: BillDef[], cycle: Pick<Cycle, "start" | "end">, txs: BillTx[], today: string): BillInCycle[] {
  const items = bills
    .filter((b) => b.active)
    .map((bill): BillInCycle => {
      const payment = findPayment(bill, cycle, txs);
      const dueDate = bill.dueDay ? dueDateInCycle(bill.dueDay, cycle) : null;
      const daysUntilDue = dueDate ? daysBetween(today, dueDate) : null;
      let status: BillStatus;
      if (payment) status = "paid";
      else if (daysUntilDue === null) status = "unscheduled";
      else if (daysUntilDue < 0) status = "overdue";
      else if (daysUntilDue <= DUE_SOON_DAYS) status = "due_soon";
      else status = "upcoming";
      const unusual = !!payment && (payment.amount > bill.amountMax * 1.1 || payment.amount < bill.amountMin * 0.9);
      return {
        bill,
        dueDate,
        daysUntilDue,
        status,
        paid: payment ? { txId: payment.id, date: payment.date, amount: payment.amount } : null,
        expected: billMidpoint(bill),
        reserve: payment ? 0 : bill.amountMax,
        unusual,
      };
    });
  return items.sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      a.bill.name.localeCompare(b.bill.name),
  );
}

export type BillsSummary = {
  count: number;
  paidCount: number;
  overdueCount: number;
  /** What this cycle's bills should cost (sum of midpoints). */
  expectedTotal: number;
  paidTotal: number;
  /** Money still to find for unpaid bills (their highest expected amounts). */
  remaining: number;
};

export function summarizeBills(items: BillInCycle[]): BillsSummary {
  return {
    count: items.length,
    paidCount: items.filter((i) => i.status === "paid").length,
    overdueCount: items.filter((i) => i.status === "overdue").length,
    expectedTotal: items.reduce((s, i) => s + i.expected, 0),
    paidTotal: items.reduce((s, i) => s + (i.paid?.amount ?? 0), 0),
    remaining: items.reduce((s, i) => s + i.reserve, 0),
  };
}

export type Commitments = {
  /** Every active bill, per month (midpoints). */
  monthly: number;
  annual: number;
  /** The part that is "wants" (subscriptions and the like). */
  discretionaryMonthly: number;
  discretionaryAnnual: number;
  count: number;
};

export function monthlyCommitments(bills: BillDef[]): Commitments {
  const active = bills.filter((b) => b.active);
  const monthly = active.reduce((s, b) => s + billMidpoint(b), 0);
  const discretionaryMonthly = active.filter((b) => b.nature === "want").reduce((s, b) => s + billMidpoint(b), 0);
  return { monthly, annual: monthly * 12, discretionaryMonthly, discretionaryAnnual: discretionaryMonthly * 12, count: active.length };
}

/** Does a statement description look like this bill? Matches on the bill's keywords (comma-separated) or its name. */
export function descriptionMatchesBill(bill: Pick<BillDef, "name" | "matchKeywords">, description: string): boolean {
  const d = normalizeName(description);
  const words = (bill.matchKeywords ?? "")
    .split(",")
    .map((w) => normalizeName(w))
    .filter((w) => w.length >= 3);
  // Keywords are your own chosen words, so they match anywhere ("netflix" in "NETFLIXCOM").
  if (words.some((w) => d.includes(w))) return true;
  // The bill's NAME is only a fallback, so it must match as a whole word: "Rent" must not fire on "PARENTS".
  const name = normalizeName(bill.name);
  return name.length >= 4 && ` ${d} `.includes(` ${name} `);
}
