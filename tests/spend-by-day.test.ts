import { describe, expect, it } from "vitest";
import { spendByDay, type SpendPoint } from "@/lib/analytics/spend-by-day";
import { monthTotals, type FlowRow } from "@/lib/analytics/summary";

const RM = (n: number) => Math.round(n * 100);
let id = 0;
const row = (date: string, rm: number, over: Partial<FlowRow> = {}): FlowRow => ({
  id: ++id, date, type: "expense", amount: RM(rm), categoryId: 1, categoryName: "Food", categoryIcon: "", nature: "need",
  isSystem: false, item: null, accountId: 1, billId: null, ...over,
});

const SEP = { start: "2026-09-01", end: "2026-09-30" };
const AUG = { start: "2026-08-01", end: "2026-08-31" };
const spentOf = (points: SpendPoint[]) => points.map((p) => p.spent ?? 0).reduce((a, b) => a + b, 0);

describe("spendByDay", () => {
  const rows = [
    row("2026-09-01", 1200, { billId: 3 }), // a bill counts: this is all spending, not the daily calendar's figure
    row("2026-09-01", 20),
    row("2026-09-03", 7.5, { categoryId: 6 }), // so does a category the calendar leaves out
    row("2026-09-30", 4),
    row("2026-09-02", 5000, { type: "income" }),
    row("2026-08-01", 10),
    row("2026-08-31", 99),
    row("2026-07-31", 500),
    row("2026-10-01", 500),
  ];

  it("gives each day's spending, which adds up to the period's total and to the end of the running total", () => {
    const points = spendByDay(rows, SEP, AUG, "2026-11-25");
    expect(points.slice(0, 3).map((p) => [p.day, p.date, p.spent, p.total])).toEqual([
      [1, "2026-09-01", RM(1220), RM(1220)],
      [2, "2026-09-02", 0, RM(1220)], // income is not spending
      [3, "2026-09-03", RM(7.5), RM(1227.5)],
    ]);
    const september = monthTotals(rows, "2026-09").expense;
    expect(spentOf(points)).toBe(september);
    expect(points[29].total).toBe(september);
    for (let i = 1; i < 30; i++) expect(points[i].total).toBe(points[i - 1].total! + points[i].spent!);
  });

  it("lines last period up by day number, and covers the longer of the two", () => {
    const points = spendByDay(rows, SEP, AUG, "2026-11-25");
    expect(points).toHaveLength(31);
    expect(points[0]).toMatchObject({ prevDate: "2026-08-01", prevSpent: RM(10), prevTotal: RM(10) });
    expect(points[30]).toEqual({ day: 31, date: null, spent: null, total: null, prevDate: "2026-08-31", prevSpent: RM(99), prevTotal: RM(109) });
  });

  it("stops this period at today, and leaves last period whole", () => {
    const soFar = rows.filter((r) => r.date < "2026-09-03" || r.date > SEP.end); // nothing entered for a later day
    const points = spendByDay(soFar, SEP, AUG, "2026-09-02");
    expect(points[1]).toMatchObject({ date: "2026-09-02", spent: 0, total: RM(1220) });
    expect(points.slice(2).every((p) => p.spent === null && p.total === null)).toBe(true);
    expect(points[2].date).toBe("2026-09-03"); // the day is still named, it just has no figure yet
    expect(points[30].prevTotal).toBe(RM(109));
  });

  it("reaches as far as an entry dated ahead, so the days still add up to the total", () => {
    const points = spendByDay(rows, SEP, AUG, "2026-09-02");
    expect(points[29]).toMatchObject({ spent: RM(4), total: monthTotals(rows, "2026-09").expense });
    expect(spentOf(points)).toBe(monthTotals(rows, "2026-09").expense);
  });

  it("keeps the 31st day of a long pay cycle as a day of its own", () => {
    const cycle = { start: "2026-09-26", end: "2026-10-26" };
    const points = spendByDay([row("2026-10-25", 30), row("2026-10-26", 12)], cycle, null, "2026-11-25");
    expect(points).toHaveLength(31);
    expect(points.slice(29).map((p) => [p.date, p.spent])).toEqual([["2026-10-25", RM(30)], ["2026-10-26", RM(12)]]);
  });

  it("has no last-period figures when there is no period before", () => {
    const points = spendByDay(rows, SEP, null, "2026-09-10");
    expect(points).toHaveLength(30);
    expect(points.every((p) => p.prevDate === null && p.prevSpent === null && p.prevTotal === null)).toBe(true);
  });
});
