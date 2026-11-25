/**
 * Spending day by day, judged against one daily limit: Home's calendar of squares. Pure (rows in, numbers out; no database,
 * no clock) and unit-tested.
 *
 * It takes entries with their REAL dates. Home's other pay-cycle figures use `rekeyRows`, which re-files an entry as "day N
 * of the cycle's month"; here that would put it under the wrong weekday (and fold a 31st cycle day into the 30th).
 */
import { fromISO, shiftDays } from "@/lib/dates";
import { asBillTxs, evaluateBills, toBudgetBills, type BillDef } from "@/lib/plan/bills";
import type { BudgetBill, FlowRow } from "./summary";

/**
 * How many weeks the calendar is given, ending with the period on screen. It shows as many of the newest as its card has
 * room for at 24 px or more each, from 7 on the narrowest to all of these on the widest (globals.css, `.day-week`; a test
 * keeps the two in step).
 */
export const CALENDAR_WEEKS = 30;

/** The first day (a Sunday) of the `CALENDAR_WEEKS` weeks that end with the week holding `end`. */
export function calendarStart(end: string): string {
  return shiftDays(end, -(fromISO(end).getDay() + (CALENDAR_WEEKS - 1) * 7));
}

/**
 * Which entry paid each bill, period by period: the Plan's own checklist, run over every pay cycle (or month) the calendar
 * reaches into. So a payment never linked to its bill is left out of an old week just as it is of this one. The rows must
 * cover each of those periods whole, or a later look-alike could be taken for the payment.
 */
export function billPaymentsByPeriod(bills: BillDef[], periods: { start: string; end: string }[], rows: FlowRow[], today: string): BudgetBill[] {
  const txs = asBillTxs(rows);
  return periods.flatMap((period) => toBudgetBills(evaluateBills(bills, period, txs, today)));
}

/** 0 = nothing spent. 1 to 4 = how near the limit, a quarter of it each (4 includes spending exactly the limit). */
export type DayLevel = 0 | 1 | 2 | 3 | 4 | "over";

export function dayLevel(spent: number, limit: number): DayLevel {
  if (spent <= 0) return 0;
  if (spent > limit) return "over";
  return Math.max(1, Math.ceil((spent * 4) / limit)) as 1 | 2 | 3 | 4;
}

export type SpendDay = {
  date: string; // YYYY-MM-DD
  /** Sen spent that day on what the limit counts: everything except bill payments and the categories left out. */
  spent: number;
  /** Sen the limit doesn't count that day (bill payments, left-out categories), kept so the cell can say it exists. */
  leftOut: number;
  level: DayLevel;
  isToday: boolean;
  /** After today, with nothing recorded on it. (An entry dated ahead is shown: Home's totals count it too.) */
  future: boolean;
};

export type DailySpend = {
  limit: number;
  /** Every day from `start` to `end`, oldest first. */
  days: SpendDay[];
  /** The calendar's columns: weeks of seven slots, Sunday first. Null = a slot outside those days. */
  weeks: (SpendDay | null)[][];
  /** The months ("YYYY-MM") to name above the columns, each over the column where it begins. */
  months: { week: number; month: string }[];
};

export function dailySpend(
  rows: FlowRow[],
  opts: {
    /** The first and last day to lay out, both included. Home gives `calendarStart` and the end of the period on screen. */
    start: string;
    end: string;
    today: string;
    /** Sen, above zero. */
    limit: number;
    /** Bill checklists (`billPaymentsByPeriod`): the entry that paid each bill is a bill payment even if never linked. */
    bills?: BudgetBill[];
    /** Expense categories the limit never counts, chosen in Settings > Payday. */
    leftOutCategoryIds?: readonly number[];
  },
): DailySpend {
  const { start, end, today, limit } = opts;
  const paid = new Set((opts.bills ?? []).map((b) => b.paidTxId).filter((id) => id !== null));
  const skipped = new Set(opts.leftOutCategoryIds ?? []);

  const totals = new Map<string, { spent: number; leftOut: number }>();
  for (const r of rows) {
    // Transfers never reach FlowRow; income is not spending.
    if (r.type !== "expense" || r.date < start || r.date > end) continue;
    const t = totals.get(r.date) ?? { spent: 0, leftOut: 0 };
    // A bill is one you linked ("mark paid", or an import that recognised it), or the one the Plan counts as its payment.
    const isBill = r.billId != null || paid.has(r.id);
    if (isBill || (r.categoryId != null && skipped.has(r.categoryId))) t.leftOut += r.amount;
    else t.spent += r.amount;
    totals.set(r.date, t);
  }

  const days: SpendDay[] = [];
  for (let date = start; date <= end; date = shiftDays(date, 1)) {
    const { spent, leftOut } = totals.get(date) ?? { spent: 0, leftOut: 0 };
    days.push({ date, spent, leftOut, level: dayLevel(spent, limit), isToday: date === today, future: date > today && spent === 0 && leftOut === 0 });
  }

  // Pad the first and last weeks so every column runs Sunday to Saturday.
  const lead = days.length ? fromISO(days[0].date).getDay() : 0;
  const slots: (SpendDay | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (slots.length % 7 !== 0) slots.push(null);
  const weeks = Array.from({ length: slots.length / 7 }, (_, i) => slots.slice(i * 7, i * 7 + 7));

  const months: DailySpend["months"] = [];
  weeks.forEach((week, i) => {
    for (const d of week) {
      if (!d) continue;
      const month = d.date.slice(0, 7);
      if (months.some((m) => m.month === month)) continue;
      // Two months starting in one column (a period from 30 Sep): the later one names it, it owns the columns that follow.
      if (months.at(-1)?.week === i) months.pop();
      months.push({ week: i, month });
    }
  });

  return { limit, days, weeks, months };
}
