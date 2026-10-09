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

export function needWantSplit(rows: FlowRow[], month: string): NeedWantSplit {
  let need = 0;
  let want = 0;
  for (const r of rows) {
    if (r.type !== "expense" || monthOf(r.date) !== month) continue;
    if (r.nature === "need") need += r.amount;
    else want += r.amount;
  }
  const { income } = monthTotals(rows, month);
  const spent = need + want;
  const vsIncome = income > 0;
  const base = vsIncome ? income : spent;
  const saved = vsIncome ? Math.max(0, income - spent) : 0;
  const pct = (v: number) => (base > 0 ? v / base : 0);
  return { need, want, saved, base, needPct: pct(need), wantPct: pct(want), savedPct: pct(saved), vsIncome };
}

export type BudgetRow = {
  categoryId: number;
  name: string;
  icon: string;
  budget: number;
  spent: number;
  /** spent / budget (can exceed 1) */
  used: number;
  /** where you "should" be by now: day / days-in-month, 1 for a finished month */
  pace: number;
  /** end-of-month estimate at the current rate */
  projected: number;
  status: "over" | "watch" | "ok";
};

/**
 * Budget progress per category for one month. `dayOfMonth` is today's day when `month`
 * is the current month; pass daysInMonth for a finished month.
 */
export function budgetProgress(
  rows: FlowRow[],
  categories: BudgetCategory[],
  month: string,
  dayOfMonthNow: number,
): BudgetRow[] {
  const dim = daysInMonthOf(month);
  const day = Math.min(Math.max(dayOfMonthNow, 1), dim);
  const pace = day / dim;
  const spentBy = new Map<number, number>();
  for (const r of rows) {
    if (r.type !== "expense" || r.categoryId == null || monthOf(r.date) !== month) continue;
    spentBy.set(r.categoryId, (spentBy.get(r.categoryId) ?? 0) + r.amount);
  }
  return categories
    .filter((c): c is BudgetCategory & { monthlyBudget: number } => !!c.monthlyBudget && c.monthlyBudget > 0)
    .map((c) => {
      const spent = spentBy.get(c.id) ?? 0;
      // Early in the month the run-rate is noisy: only extrapolate after a few days.
      const projected = day >= 5 && pace < 1 ? Math.round(spent / pace) : spent;
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
