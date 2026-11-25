/**
 * Spending day by day, judged against one daily limit: Home's calendar of squares. Pure (rows in, numbers out; no database,
 * no clock) and unit-tested.
 *
 * It takes entries with their REAL dates. Home's other pay-cycle figures use `rekeyRows`, which re-files an entry as "day N
 * of the cycle's month"; here that would put it under the wrong weekday (and fold a 31st cycle day into the 30th).
 */
import { fromISO, shiftDays } from "@/lib/dates";
import type { BudgetBill, FlowRow } from "./summary";

/** 0 = nothing spent. 1 to 4 = how near the limit, a quarter of it each (4 includes spending exactly the limit). */
export type DayLevel = 0 | 1 | 2 | 3 | 4 | "over";

export function dayLevel(spent: number, limit: number): DayLevel {
  if (spent <= 0) return 0;
  if (spent > limit) return "over";
  return Math.max(1, Math.ceil((spent * 4) / limit)) as 1 | 2 | 3 | 4;
}

export type SpendDay = {
  date: string; // YYYY-MM-DD
  /** Sen spent that day on everything except bills: what is judged against the limit. */
  spent: number;
  /** Sen of bill payments that day. Left out of `spent`, kept so the square can say they exist. */
  bills: number;
  level: DayLevel;
  isToday: boolean;
  /** After today, with nothing recorded on it. (An entry dated ahead is shown: Home's totals count it too.) */
  future: boolean;
};

export type DailySpend = {
  limit: number;
  /** Every day of the period, oldest first. */
  days: SpendDay[];
  /** The calendar's columns: weeks of seven slots, Sunday first. Null = a slot outside the period. */
  weeks: (SpendDay | null)[][];
  /** The months ("YYYY-MM") to name above the columns, each over the column where it begins. */
  months: { week: number; month: string }[];
  /** Days over the limit. */
  overDays: number;
  /** Days that have happened (today counts), or that already have something recorded. */
  daysSoFar: number;
};

export function dailySpend(
  rows: FlowRow[],
  opts: {
    /** The period on screen, both days included. */
    start: string;
    end: string;
    today: string;
    /** Sen, above zero. */
    limit: number;
    /** The period's bill checklist (`toBudgetBills`): the entry that paid each bill is a bill payment even if never linked. */
    bills?: BudgetBill[];
  },
): DailySpend {
  const { start, end, today, limit } = opts;
  const paid = new Set((opts.bills ?? []).map((b) => b.paidTxId).filter((id) => id !== null));

  const totals = new Map<string, { spent: number; bills: number }>();
  for (const r of rows) {
    // Transfers never reach FlowRow; income is not spending.
    if (r.type !== "expense" || r.date < start || r.date > end) continue;
    const t = totals.get(r.date) ?? { spent: 0, bills: 0 };
    // A bill is one you linked ("mark paid", or an import that recognised it), or the one the Plan counts as its payment.
    if (r.billId != null || paid.has(r.id)) t.bills += r.amount;
    else t.spent += r.amount;
    totals.set(r.date, t);
  }

  const days: SpendDay[] = [];
  for (let date = start; date <= end; date = shiftDays(date, 1)) {
    const { spent, bills } = totals.get(date) ?? { spent: 0, bills: 0 };
    days.push({ date, spent, bills, level: dayLevel(spent, limit), isToday: date === today, future: date > today && spent === 0 && bills === 0 });
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

  return {
    limit,
    days,
    weeks,
    months,
    overDays: days.filter((d) => d.level === "over").length,
    daysSoFar: days.filter((d) => !d.future).length,
  };
}
