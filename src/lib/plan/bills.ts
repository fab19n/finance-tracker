import type { BudgetBill } from "@/lib/analytics/summary";
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
  /** How often it falls due; absent means monthly (every bill before the column existed). */
  frequency?: BillFrequency;
  /** 1-12: for yearly the month it falls due, for quarterly the first of its four months. Null for monthly. */
  dueMonth?: number | null;
};

export type BillFrequency = "monthly" | "quarterly" | "yearly";

export type BillTx = {
  id: number;
  date: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  accountId: number;
  item: string | null;
  billId: number | null;
};

/** "not_due": a yearly or quarterly bill that falls in none of this period's months and has not been paid: nothing is held back. */
export type BillStatus = "paid" | "overdue" | "due_soon" | "upcoming" | "unscheduled" | "not_due";

export type BillInCycle = {
  bill: BillDef;
  /** Does the bill fall due in this period? Always true for a monthly bill. */
  due: boolean;
  /** When it is not due in this period: the date it next falls due (its due day, or the 1st when none is set). */
  nextDue: string | null;
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

export const FREQUENCY_LABEL: Record<BillFrequency, string> = { monthly: "Every month", quarterly: "Every 3 months", yearly: "Once a year" };
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The calendar months (1-12) a bill falls due in; every month for a monthly bill (or one whose due month is missing). */
export function dueMonths(b: Pick<BillDef, "frequency" | "dueMonth">): number[] {
  const m = b.dueMonth;
  const valid = typeof m === "number" && Number.isInteger(m) && m >= 1 && m <= 12;
  if (!b.frequency || b.frequency === "monthly" || !valid) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (b.frequency === "yearly") return [m];
  return [0, 3, 6, 9].map((k) => ((m - 1 + k) % 12) + 1).sort((a, c) => a - c);
}

const isMonthly = (b: Pick<BillDef, "frequency" | "dueMonth">) => dueMonths(b).length === 12;

/** How many times a year the bill is paid. */
export const paymentsPerYear = (b: Pick<BillDef, "frequency" | "dueMonth">) => dueMonths(b).length;

/** The date a bill falls due in `month` ("YYYY-MM"), or null when it does not fall due that month. A bill with no due day counts on the 1st. */
function dueDateInMonth(b: Pick<BillDef, "frequency" | "dueMonth" | "dueDay">, month: string): string | null {
  if (!dueMonths(b).includes(Number(month.slice(5, 7)))) return null;
  return clampDay(month, b.dueDay ?? 1);
}

/**
 * Does this bill fall due within the period (a pay cycle or a month)? A monthly bill always does. A quarterly or yearly one
 * does when one of its months has its due day inside the period's dates, so the cycle 26 Oct - 25 Nov holds a bill due on
 * 5 Nov (month 11) and not one due on 28 Oct (month 10, which belongs to the cycle before). A bill with no due day counts
 * on the 1st, so every date, and therefore every bill, belongs to exactly one period.
 */
export function dueInPeriod(b: Pick<BillDef, "frequency" | "dueMonth" | "dueDay">, period: { start: string; end: string }): boolean {
  if (isMonthly(b)) return true;
  return dueDateInPeriod(b, period) !== null;
}

function dueDateInPeriod(b: Pick<BillDef, "frequency" | "dueMonth" | "dueDay">, period: { start: string; end: string }): string | null {
  const last = period.end.slice(0, 7);
  for (let m = period.start.slice(0, 7); m <= last; m = shiftMonth(m, 1)) {
    const d = dueDateInMonth(b, m);
    if (d && d >= period.start && d <= period.end) return d;
  }
  return null;
}

/** The first date on or after `from` on which the bill falls due (within the next 13 months). */
export function nextDueDate(b: Pick<BillDef, "frequency" | "dueMonth" | "dueDay">, from: string): string | null {
  const first = from.slice(0, 7);
  for (let i = 0; i <= 13; i++) {
    const d = dueDateInMonth(b, shiftMonth(first, i));
    if (d && d >= from) return d;
  }
  return null;
}

/** "March" or "March, June, September, December": the months a non-monthly bill falls due in. */
export function dueMonthsText(b: Pick<BillDef, "frequency" | "dueMonth">): string {
  return dueMonths(b).map((m) => MONTH_NAMES[m - 1]).join(", ");
}

/** What a bill costs per month once its payments are spread over the year (a yearly bill counts a twelfth). */
export const perMonthAmount = (b: Pick<BillDef, "amountMin" | "amountMax" | "frequency" | "dueMonth">, amount: number) => Math.round((amount * paymentsPerYear(b)) / 12);

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

const RANK: Record<BillStatus, number> = { overdue: 0, due_soon: 1, upcoming: 2, unscheduled: 3, paid: 4, not_due: 5 };

/** The checklist for one cycle: every active bill with its status, most urgent first. */
export function evaluateBills(bills: BillDef[], cycle: Pick<Cycle, "start" | "end">, txs: BillTx[], today: string): BillInCycle[] {
  const items = bills
    .filter((b) => b.active)
    .map((bill): BillInCycle => {
      const payment = findPayment(bill, cycle, txs);
      const due = dueInPeriod(bill, cycle);
      // A bill that is not due in this period has no due date here; its next one is shown instead.
      const dueDate = !due ? null : bill.dueDay ? (isMonthly(bill) ? dueDateInCycle(bill.dueDay, cycle) : dueDateInPeriod(bill, cycle)) : null;
      const daysUntilDue = dueDate ? daysBetween(today, dueDate) : null;
      let status: BillStatus;
      if (payment) status = "paid";
      else if (!due) status = "not_due";
      else if (daysUntilDue === null) status = "unscheduled";
      else if (daysUntilDue < 0) status = "overdue";
      else if (daysUntilDue <= DUE_SOON_DAYS) status = "due_soon";
      else status = "upcoming";
      const unusual = !!payment && (payment.amount > bill.amountMax * 1.1 || payment.amount < bill.amountMin * 0.9);
      return {
        bill,
        due,
        nextDue: due ? null : nextDueDate(bill, cycle.start),
        dueDate,
        daysUntilDue,
        status,
        paid: payment ? { txId: payment.id, date: payment.date, amount: payment.amount } : null,
        expected: billMidpoint(bill),
        reserve: payment || !due ? 0 : bill.amountMax,
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

/**
 * What the budgets need to know about each bill in a period: its category, its usual amount, and the entry that paid it.
 * The same `findPayment` as the Plan's checklist decides "paid", so a bill is paid here exactly when it is paid there.
 */
export function toBudgetBills(items: BillInCycle[]): BudgetBill[] {
  // A yearly or quarterly bill that is not due in the period (and was not paid in it) is not part of it: no budget expects it.
  return items.filter((i) => i.status !== "not_due").map((i) => ({ categoryId: i.bill.categoryId, expected: i.expected, paidTxId: i.paid?.txId ?? null }));
}

/** Flow rows as the bill checklist reads them (an unlinked entry has no bill). */
export function asBillTxs(rows: { id: number; date: string; amount: number; type: "income" | "expense"; accountId: number; item: string | null; billId?: number | null }[]): BillTx[] {
  return rows.map((r) => ({ id: r.id, date: r.date, amount: r.amount, type: r.type, accountId: r.accountId, item: r.item, billId: r.billId ?? null }));
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

export function summarizeBills(all: BillInCycle[]): BillsSummary {
  // Bills that are not due this period (and unpaid) are listed but are not part of its count or totals.
  const items = all.filter((i) => i.status !== "not_due");
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
  // "A month" spreads a yearly bill over twelve months (a twelfth) and a quarterly one over three (a third); "a year" is what
  // is really paid. For monthly bills these are the plain midpoint and twelve times it, as before.
  const wants = active.filter((b) => b.nature === "want");
  const perMonth = (list: BillDef[]) => list.reduce((s, b) => s + perMonthAmount(b, billMidpoint(b)), 0);
  const perYear = (list: BillDef[]) => list.reduce((s, b) => s + billMidpoint(b) * paymentsPerYear(b), 0);
  return { monthly: perMonth(active), annual: perYear(active), discretionaryMonthly: perMonth(wants), discretionaryAnnual: perYear(wants), count: active.length };
}

/**
 * The most the bills due in this period can take (their highest amounts): what the payday plan sets aside as "bills".
 * Monthly bills always count; a yearly or quarterly one only in the cycle it falls due.
 */
export function billsDueMax(bills: BillDef[], period: { start: string; end: string }): number {
  return bills.filter((b) => b.active && dueInPeriod(b, period)).reduce((s, b) => s + b.amountMax, 0);
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
