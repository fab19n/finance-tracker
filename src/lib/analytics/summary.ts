/**
 * Pure analytics over income/expense rows. No database, no clock: callers pass
 * everything in, so every function here is deterministic and unit-tested.
 * Transfers are never included - moving money between your own accounts is neither
 * income nor spending.
 */

export type FlowRow = {
  id: number;
  date: string; // YYYY-MM-DD
  type: "income" | "expense";
  amount: number; // sen, positive
  categoryId: number | null;
  categoryName: string;
  categoryIcon: string;
  nature: "need" | "want" | "saving";
  isSystem: boolean;
  item: string | null;
  accountId: number;
  /** The recurring bill this entry was linked to ("mark paid"), when it was. */
  billId?: number | null;
};

export type BudgetCategory = {
  id: number;
  name: string;
  icon: string;
  monthlyBudget: number | null;
};

const monthOf = (d: string) => d.slice(0, 7);
const dayOf = (d: string) => Number(d.slice(8, 10));

export function daysInMonthOf(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export type MonthTotals = {
  income: number;
  expense: number;
  net: number;
  /** (income - expense) / income, null when there is no income. Can be negative. */
  savingsRate: number | null;
};

export function monthTotals(rows: FlowRow[], month: string, throughDay = 31): MonthTotals {
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    if (monthOf(r.date) !== month || dayOf(r.date) > throughDay) continue;
    if (r.type === "income") income += r.amount;
    else expense += r.amount;
  }
  return {
    income,
    expense,
    net: income - expense,
    savingsRate: income > 0 ? (income - expense) / income : null,
  };
}

/**
 * Has a paycheck landed in this stretch? A few sen of interest, or a friend paying back RM 22, is not one: without this,
 * RM 0.11 of interest turned "no pay recorded yet" into a red "Overspent" and "-2461200% of income". "Real" is a tenth of
 * the pay you expect (or RM 5 when you haven't said).
 */
export function paycheckIn(income: number, expectedIncome: number): boolean {
  return income >= Math.max(500, Math.round(expectedIncome * 0.1));
}

export type CategorySpend = {
  categoryId: number | null;
  name: string;
  icon: string;
  nature: "need" | "want" | "saving";
  total: number;
  count: number;
  /** share of total spending, 0..1 */
  share: number;
};

/** Expense rows of one month grouped by category, biggest first. */
export function categoryBreakdown(rows: FlowRow[], month: string): CategorySpend[] {
  const map = new Map<string, CategorySpend>();
  let total = 0;
  for (const r of rows) {
    if (r.type !== "expense" || monthOf(r.date) !== month) continue;
    total += r.amount;
    const key = String(r.categoryId ?? r.categoryName);
    const cur = map.get(key) ?? {
      categoryId: r.categoryId,
      name: r.categoryName,
      icon: r.categoryIcon,
      nature: r.nature,
      total: 0,
      count: 0,
      share: 0,
    };
    cur.total += r.amount;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()]
    .map((c) => ({ ...c, share: total > 0 ? c.total / total : 0 }))
    .sort((a, b) => b.total - a.total);
}

export type AccountSpend = {
  accountId: number;
  total: number;
  count: number;
  /** share of total spending, 0..1 */
  share: number;
};

/**
 * Expense rows of one month grouped by the account they were paid from, biggest first. Transfers are not here (they are
 * not spending), so putting money into savings does not make the spending account look like it spent it.
 */
export function accountBreakdown(rows: FlowRow[], month: string): AccountSpend[] {
  const map = new Map<number, AccountSpend>();
  let total = 0;
  for (const r of rows) {
    if (r.type !== "expense" || monthOf(r.date) !== month) continue;
    total += r.amount;
    const cur = map.get(r.accountId) ?? { accountId: r.accountId, total: 0, count: 0, share: 0 };
    cur.total += r.amount;
    cur.count += 1;
    map.set(r.accountId, cur);
  }
  return [...map.values()]
    .map((a) => ({ ...a, share: total > 0 ? a.total / total : 0 }))
    .sort((a, b) => b.total - a.total);
}

export type MonthPoint = { month: string; income: number; expense: number; net: number };

export function monthlySeries(rows: FlowRow[], months: string[]): MonthPoint[] {
  return months.map((m) => {
    const t = monthTotals(rows, m);
    return { month: m, income: t.income, expense: t.expense, net: t.net };
  });
}

export type CumulativePoint = { day: number; current: number | null; previous: number | null };

/**
 * Cumulative spending by day-of-month, for this month vs the previous one.
 * `currentUpToDay` stops the "current" line at today (null afterwards).
 */
export function cumulativeSpend(
  rows: FlowRow[],
  month: string,
  prevMonth: string,
  currentUpToDay: number,
): CumulativePoint[] {
  const days = Math.max(daysInMonthOf(month), daysInMonthOf(prevMonth));
  const cur = new Array<number>(days + 1).fill(0);
  const prev = new Array<number>(days + 1).fill(0);
  for (const r of rows) {
    if (r.type !== "expense") continue;
    const m = monthOf(r.date);
    if (m === month) cur[dayOf(r.date)] += r.amount;
    else if (m === prevMonth) prev[dayOf(r.date)] += r.amount;
  }
  const out: CumulativePoint[] = [];
  let c = 0;
  let p = 0;
  for (let d = 1; d <= days; d++) {
    c += cur[d];
    p += prev[d];
    out.push({
      day: d,
      current: d <= currentUpToDay && d <= daysInMonthOf(month) ? c : null,
      previous: d <= daysInMonthOf(prevMonth) ? p : null,
    });
  }
  return out;
}

export type ItemStat = { item: string; category: string; total: number; count: number; average: number };

/** Specific things you buy, grouped case-insensitively. Rows without an item are skipped. */
export function topItems(rows: FlowRow[], month: string | null, limit = 10): ItemStat[] {
  const map = new Map<string, ItemStat>();
  for (const r of rows) {
    if (r.type !== "expense" || !r.item?.trim()) continue;
    if (month && monthOf(r.date) !== month) continue;
    const key = r.item.trim().toLowerCase();
    const cur = map.get(key) ?? { item: r.item.trim(), category: r.categoryName, total: 0, count: 0, average: 0 };
    cur.total += r.amount;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()]
    .map((i) => ({ ...i, average: Math.round(i.total / i.count) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export type NeedWantSplit = {
  need: number;
  want: number;
  /** income minus all spending, floored at 0 */
  saved: number;
  /** the base the percentages are measured against: income if any, else total spending */
  base: number;
  needPct: number;
  wantPct: number;
  savedPct: number;
  /** true when percentages are of income (the 50/30/20 rule is defined on income) */
  vsIncome: boolean;
};

/** `incomeKnown` lets a page pass its own "is there a real paycheck" test (a few sen of interest is not pay); default is any income. */
export function needWantSplit(rows: FlowRow[], month: string, incomeKnown?: boolean): NeedWantSplit {
  let need = 0;
  let want = 0;
  for (const r of rows) {
    if (r.type !== "expense" || monthOf(r.date) !== month) continue;
    if (r.nature === "need") need += r.amount;
    else want += r.amount;
  }
  const { income } = monthTotals(rows, month);
  const spent = need + want;
  const vsIncome = income > 0 && incomeKnown !== false;
  const base = vsIncome ? income : spent;
  const saved = vsIncome ? Math.max(0, income - spent) : 0;
  const pct = (v: number) => (base > 0 ? v / base : 0);
  return { need, want, saved, base, needPct: pct(need), wantPct: pct(want), savedPct: pct(saved), vsIncome };
}

/**
 * A recurring bill as the budgets need it (see `toBudgetBills` in plan/bills.ts): which category it belongs to, what it
 * usually costs, and the entry that paid it in this period (null while it is unpaid).
 */
export type BudgetBill = {
  categoryId: number | null;
  /** Typical amount: the midpoint of its range. */
  expected: number;
  paidTxId: number | null;
};

export type BudgetRow = {
  categoryId: number;
  name: string;
  icon: string;
  budget: number;
  spent: number;
  /** spent / budget (can exceed 1) */
  used: number;
  /** where you "should" be by now: days gone / days in the period, 1 for a finished one */
  pace: number;
  /** end-of-period estimate: bills already paid, bills still due, and the rest at the current rate */
  projected: number;
  /** Of `spent`: the part that paid a recurring bill. A bill is a fixed amount, so it is never extrapolated. */
  billsPaid: number;
  /** Bills of this category still to pay before the period ends (their typical amounts). */
  billsDue: number;
  /** Everything spent here so far was a bill, all of them are paid, and none is still due: nothing more is coming. */
  settled: boolean;
  status: "over" | "watch" | "ok";
};

/** Before this many days of a period the run-rate of everyday spending is too noisy to extrapolate. */
const PROJECT_FROM_DAY = 5;

/**
 * Budget progress per category for one period (`month` names it: a calendar month, or the pay cycle filed under it).
 * `dayOfMonthNow` is today's day when `month` is the current one; pass daysInMonth for a finished month.
 *
 * `opts.total` is how many days the period really has (a pay cycle named after a 30-day month can run 31 days) and
 * `opts.elapsed` how many have passed (both default to the calendar month and `dayOfMonthNow`).
 *
 * Spending is projected in two parts. A recurring bill is a lump at a fixed amount, not a drip: a paid bill stays what it
 * was paid and an unpaid one is expected at its usual amount. Only the rest (food, fuel...) is carried forward at the rate
 * so far. Without `opts.bills` everything is treated as the second kind.
 */
export function budgetProgress(
  rows: FlowRow[],
  categories: BudgetCategory[],
  month: string,
  dayOfMonthNow: number,
  opts: { elapsed?: number; total?: number; bills?: BudgetBill[] } = {},
): BudgetRow[] {
  const total = Math.max(1, opts.total ?? daysInMonthOf(month));
  const day = Math.min(Math.max(opts.elapsed ?? dayOfMonthNow, 1), total);
  const pace = day / total;
  const spentBy = new Map<number, number>();
  const entries = new Map<number, { categoryId: number; amount: number }>();
  for (const r of rows) {
    if (r.type !== "expense" || r.categoryId == null || monthOf(r.date) !== month) continue;
    spentBy.set(r.categoryId, (spentBy.get(r.categoryId) ?? 0) + r.amount);
    entries.set(r.id, { categoryId: r.categoryId, amount: r.amount });
  }
  return categories
    .filter((c): c is BudgetCategory & { monthlyBudget: number } => !!c.monthlyBudget && c.monthlyBudget > 0)
    .map((c) => {
      const spent = spentBy.get(c.id) ?? 0;
      let billsPaid = 0;
      let billsDue = 0;
      for (const bill of opts.bills ?? []) {
        if (bill.categoryId !== c.id) continue;
        if (bill.paidTxId === null) {
          // Still to come, but only while the period is still running: a finished one never got it.
          if (pace < 1) billsDue += bill.expected;
          continue;
        }
        // Paid by an entry in this category and period; a payment filed elsewhere is not part of this spending.
        const paid = entries.get(bill.paidTxId);
        if (paid && paid.categoryId === c.id) billsPaid += paid.amount;
      }
      const rest = Math.max(0, spent - billsPaid);
      // Early on the run-rate is noisy: only extrapolate after a few days.
      const projectedRest = day >= PROJECT_FROM_DAY && pace < 1 ? Math.round(rest / pace) : rest;
      const projected = billsPaid + billsDue + projectedRest;
      const settled = billsPaid > 0 && billsDue === 0 && rest === 0;
      const status: BudgetRow["status"] =
        spent > c.monthlyBudget ? "over" : projected > c.monthlyBudget * 1.05 ? "watch" : "ok";
      return {
        categoryId: c.id,
        name: c.name,
        icon: c.icon,
        budget: c.monthlyBudget,
        spent,
        used: spent / c.monthlyBudget,
        pace,
        projected,
        billsPaid,
        billsDue,
        settled,
        status,
      };
    })
    .sort((a, b) => b.used - a.used);
}

/** Signed change vs a previous value as a ratio, null when there is nothing to compare. */
export function changeRatio(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}
