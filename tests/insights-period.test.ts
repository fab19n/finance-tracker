import { describe, expect, it } from "vitest";
import { periodName } from "@/lib/analytics/dashboard-text";
import { detectLeaks, type LeakPeriod } from "@/lib/analytics/leakage";
import { rekeyRows, resolvePeriod } from "@/lib/analytics/periods";
import { budgetProgress, type FlowRow } from "@/lib/analytics/summary";
import { formatRM } from "@/lib/money";

const RM = (n: number) => Math.round(n * 100);
let n = 0;
const row = (date: string, type: "income" | "expense", rm: number, categoryId = 1, categoryName = "Eating Out"): FlowRow => ({
  id: ++n, date, type, amount: RM(rm), categoryId, categoryName, categoryIcon: "", nature: "want", isSystem: false, item: null, accountId: 1,
});

// Paid on the 26th: the cycle named October runs 26 Sep - 25 Oct.
const salaryDates = ["2026-07-26", "2026-08-26", "2026-09-26"];
const today = "2026-10-10";
const categories = [{ id: 1, name: "Eating Out", icon: "", monthlyBudget: RM(300) }];
const rows: FlowRow[] = [
  row("2026-09-26", "income", 5000, 9, "Salary"),
  row("2026-09-28", "expense", 150), // September on the calendar, October's cycle
  row("2026-10-03", "expense", 200),
];

function leakPeriod(choice: ReturnType<typeof resolvePeriod>, keyed: FlowRow[]): LeakPeriod {
  const period = choice.period;
  return {
    rows: keyed,
    month: choice.month,
    day: choice.dayNow,
    elapsed: choice.elapsed,
    total: choice.total,
    current: choice.isCurrent,
    unit: choice.unit,
    nameOf: (m) => periodName(m, choice.month, !!period),
    entries: (id) => `/transactions?month=all&from=${choice.start}&to=${choice.end}&category=${id}`,
    home: (m) => `/dashboard?view=${choice.view}&month=${m}`,
  };
}

const leaks = (period?: LeakPeriod) =>
  detectLeaks({
    rows,
    today,
    categories,
    assumptions: { sp500ReturnPct: 8, horizonYears: 10 },
    cash: { unaccounted90: 0, withdrawn90: 0 },
    period,
  });

describe("resolvePeriod: one answer for Home and Insights", () => {
  it("defaults to the pay cycle when a salary was recorded recently, named after its month", () => {
    const c = resolvePeriod({ today, salaryDates, paydayDay: 28 });
    expect(c).toMatchObject({ view: "cycle", month: "2026-10", nowMonth: "2026-10", isCurrent: true, unit: "cycle", start: "2026-09-26", end: "2026-10-25", total: 30 });
    // 26 Sep is day 1, so 10 Oct is day 15.
    expect(c.dayNow).toBe(15);
    expect(c.elapsed).toBe(15);
  });

  it("falls back to the calendar month with no recent salary, and ?view= wins over the default", () => {
    expect(resolvePeriod({ today, salaryDates: [], paydayDay: 28 })).toMatchObject({ view: "month", period: null, start: "2026-10-01", end: "2026-10-31", dayNow: 10, total: 31 });
    expect(resolvePeriod({ today, salaryDates, paydayDay: 28, view: "month" }).view).toBe("month");
    expect(resolvePeriod({ today, salaryDates: [], paydayDay: 28, view: "cycle" }).view).toBe("cycle");
  });

  it("an earlier period is whole (the day is capped at its month's length, the pace uses the real 31 days), and a month outside the range falls back to the newest", () => {
    const c = resolvePeriod({ today, salaryDates, paydayDay: 28, month: "2026-09" });
    expect(c).toMatchObject({ month: "2026-09", isCurrent: false, start: "2026-08-26", end: "2026-09-25", dayNow: 30, elapsed: 31 });
    expect(resolvePeriod({ today, salaryDates, paydayDay: 28, month: "2027-05" }).month).toBe("2026-10");
    expect(resolvePeriod({ today, salaryDates, paydayDay: 28, month: "garbage" }).month).toBe("2026-10");
  });
});

describe("Insights judges a budget over the period Home shows", () => {
  const choice = resolvePeriod({ today, salaryDates, paydayDay: 28 });
  const keyed = rekeyRows(rows, choice.periods!);

  it("the over-budget figure for a category equals Home's budget row for the same period", () => {
    // Home's call, verbatim: re-keyed rows, the period's day, its real pace.
    const home = budgetProgress(keyed, categories, choice.month, choice.dayNow, { elapsed: choice.elapsed, total: choice.total })[0];
    expect(home.spent).toBe(RM(350)); // 150 paid on 28 Sep counts: it is in the October cycle
    expect(home.status).toBe("over");

    const insight = leaks(leakPeriod(choice, keyed)).find((i) => i.id === "budget-1")!;
    expect(insight).toBeDefined();
    expect(insight.evidence[0]).toContain(formatRM(home.spent));
    expect(insight.evidence[0]).toContain(formatRM(home.budget));
    expect(insight.evidence[1]).toContain(`Over by ${formatRM(home.spent - home.budget)}`);
    expect(insight.annualSaving).toBe((home.spent - home.budget) * 12);
    expect(insight.scope).toBe("Oct cycle so far");
    // The link opens the cycle's date range, not a calendar month that would show a different total.
    expect(insight.href).toBe("/transactions?month=all&from=2026-09-26&to=2026-10-25&category=1");
    expect(insight.evidence[1]).toContain("15 days left in the cycle");
  });

  it("the calendar-month reading of the same rows disagrees, which is why the two pages had to share a period", () => {
    const calendar = leaks().find((i) => i.id === "budget-1");
    // Only the 3 Oct entry falls in October: RM 200 of RM 300 is not "over", where Home's cycle says RM 350.
    expect(calendar?.title).not.toBe("Eating Out is over budget");
    expect(calendar?.evidence[0]).toContain(formatRM(RM(200)));
  });

  it("every finding carries the period it was judged over", () => {
    const found = leaks(leakPeriod(choice, keyed));
    expect(found.length).toBeGreaterThan(0);
    for (const i of found) expect(i.scope).toBeTruthy();
  });

  it("a finished period says how far over it ended, with no days left", () => {
    const past = resolvePeriod({ today, salaryDates, paydayDay: 28, month: "2026-09" });
    const pastRows = [row("2026-08-27", "expense", 400)];
    const found = detectLeaks({
      rows: pastRows,
      today,
      categories,
      assumptions: { sp500ReturnPct: 8, horizonYears: 10 },
      cash: { unaccounted90: 0, withdrawn90: 0 },
      period: leakPeriod(past, rekeyRows(pastRows, past.periods!)),
    }).find((i) => i.id === "budget-1")!;
    expect(found.scope).toBe("Sep cycle");
    expect(found.evidence[1]).toBe(`Over by ${formatRM(RM(100))}`);
  });
});
