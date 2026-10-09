import { describe, expect, it } from "vitest";
import {
  budgetProgress,
  categoryBreakdown,
  changeRatio,
  cumulativeSpend,
  daysInMonthOf,
  monthlySeries,
  monthTotals,
  needWantSplit,
  topItems,
} from "@/lib/analytics/summary";
import { row } from "./helpers";

describe("monthTotals", () => {
  const rows = [
    row({ date: "2026-09-28", rm: 5000, type: "income", cat: "Salary", nature: "saving" }),
    row({ date: "2026-10-01", rm: 100 }),
    row({ date: "2026-10-05", rm: 50 }),
    row({ date: "2026-10-20", rm: 30 }),
  ];
  it("splits income and spending by month", () => {
    expect(monthTotals(rows, "2026-09")).toMatchObject({ income: 500000, expense: 0, net: 500000 });
    expect(monthTotals(rows, "2026-10")).toMatchObject({ income: 0, expense: 18000, net: -18000 });
  });
  it("savings rate is null with no income, and can be negative", () => {
    expect(monthTotals(rows, "2026-10").savingsRate).toBeNull();
    const t = monthTotals([row({ date: "2026-10-01", rm: 1000, type: "income" }), row({ date: "2026-10-02", rm: 1500 })], "2026-10");
    expect(t.savingsRate).toBeCloseTo(-0.5);
  });
  it("throughDay gives a like-for-like partial month", () => {
    expect(monthTotals(rows, "2026-10", 9).expense).toBe(15000);
    expect(monthTotals(rows, "2026-10", 31).expense).toBe(18000);
  });
});

describe("categoryBreakdown", () => {
  it("groups by category, biggest first, shares sum to 1", () => {
    const rows = [
      row({ date: "2026-10-01", rm: 60, cat: "Food" }),
      row({ date: "2026-10-02", rm: 20, cat: "Food" }),
      row({ date: "2026-10-03", rm: 20, cat: "Fuel" }),
      row({ date: "2026-09-03", rm: 999, cat: "Fuel" }), // other month, ignored
    ];
    const out = categoryBreakdown(rows, "2026-10");
    expect(out.map((c) => c.name)).toEqual(["Food", "Fuel"]);
    expect(out[0]).toMatchObject({ total: 8000, count: 2 });
    expect(out.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1);
    expect(out[0].share).toBeCloseTo(0.8);
  });
  it("ignores income", () => {
    expect(categoryBreakdown([row({ date: "2026-10-01", rm: 10, type: "income" })], "2026-10")).toEqual([]);
  });
});

describe("monthlySeries", () => {
  it("returns a point for every month, including empty ones", () => {
    const out = monthlySeries([row({ date: "2026-08-10", rm: 10 })], ["2026-07", "2026-08", "2026-09"]);
    expect(out.map((p) => p.expense)).toEqual([0, 1000, 0]);
  });
});

describe("cumulativeSpend", () => {
  const rows = [
    row({ date: "2026-10-01", rm: 10 }),
    row({ date: "2026-10-03", rm: 5 }),
    row({ date: "2026-09-02", rm: 20 }),
    row({ date: "2026-09-30", rm: 7 }),
  ];
  const pts = cumulativeSpend(rows, "2026-10", "2026-09", 3);
  it("runs a cumulative total and stops the current line at today", () => {
    expect(pts[0]).toMatchObject({ day: 1, current: 1000, previous: 0 });
    expect(pts[2]).toMatchObject({ day: 3, current: 1500, previous: 2000 });
    expect(pts[3].current).toBeNull();
  });
  it("keeps the previous month going to its last day only", () => {
    expect(pts).toHaveLength(31);
    expect(pts[29]).toMatchObject({ day: 30, previous: 2700 });
    expect(pts[30].previous).toBeNull(); // September has 30 days
  });
});

describe("topItems", () => {
  it("groups case-insensitively and skips rows without an item", () => {
    const rows = [
      row({ date: "2026-10-01", rm: 14, item: "Starbucks latte" }),
      row({ date: "2026-10-02", rm: 15, item: "starbucks LATTE" }),
      row({ date: "2026-10-03", rm: 40, item: "Petrol" }),
      row({ date: "2026-10-04", rm: 99, item: null }),
    ];
    const out = topItems(rows, "2026-10");
    expect(out.map((i) => i.item)).toEqual(["Petrol", "Starbucks latte"]);
    expect(out[1]).toMatchObject({ count: 2, total: 2900, average: 1450 });
  });
});

describe("needWantSplit", () => {
  it("measures against income when there is some", () => {
    const rows = [
      row({ date: "2026-10-01", rm: 5000, type: "income", nature: "saving" }),
      row({ date: "2026-10-02", rm: 2000, nature: "need" }),
      row({ date: "2026-10-03", rm: 1000, nature: "want" }),
    ];
    const s = needWantSplit(rows, "2026-10");
    expect(s).toMatchObject({ need: 200000, want: 100000, saved: 200000, vsIncome: true });
    expect([s.needPct, s.wantPct, s.savedPct]).toEqual([0.4, 0.2, 0.4]);
  });
  it("falls back to share-of-spending with no income, and saved is zero", () => {
    const rows = [row({ date: "2026-10-02", rm: 300, nature: "need" }), row({ date: "2026-10-03", rm: 100, nature: "want" })];
    const s = needWantSplit(rows, "2026-10");
    expect(s.vsIncome).toBe(false);
    expect(s.saved).toBe(0);
    expect(s.needPct).toBeCloseTo(0.75);
  });
  it("never reports negative saving when you overspend", () => {
    const rows = [row({ date: "2026-10-01", rm: 100, type: "income" }), row({ date: "2026-10-02", rm: 500 })];
    expect(needWantSplit(rows, "2026-10").saved).toBe(0);
  });
});

describe("budgetProgress", () => {
  const cats = [{ id: 1, name: "Eating Out", icon: "x", monthlyBudget: 10_000 }];
  it("flags over budget", () => {
    const b = budgetProgress([row({ date: "2026-10-03", rm: 120 })], cats, "2026-10", 15);
    expect(b[0].status).toBe("over");
    expect(b[0].used).toBeCloseTo(1.2);
  });
  it("flags on-pace-to-overspend using the run rate, once past the first few days", () => {
    // RM 40 by day 10 of 31 => finishes near RM 124 > 105% of RM 100
    const b = budgetProgress([row({ date: "2026-10-03", rm: 40 })], cats, "2026-10", 10);
    expect(b[0].status).toBe("watch");
    expect(b[0].projected).toBeGreaterThan(10_000);
  });
  it("is ok when comfortably under pace", () => {
    expect(budgetProgress([row({ date: "2026-10-03", rm: 10 })], cats, "2026-10", 10)[0].status).toBe("ok");
  });
  it("does not extrapolate in the first days of the month", () => {
    const b = budgetProgress([row({ date: "2026-10-02", rm: 60 })], cats, "2026-10", 2);
    expect(b[0].projected).toBe(6000);
    expect(b[0].status).toBe("ok");
  });
  it("ignores categories without a budget", () => {
    expect(budgetProgress([], [{ id: 2, name: "X", icon: "x", monthlyBudget: null }], "2026-10", 10)).toEqual([]);
  });
});

describe("helpers", () => {
  it("changeRatio", () => {
    expect(changeRatio(150, 100)).toBeCloseTo(0.5);
    expect(changeRatio(50, 100)).toBeCloseTo(-0.5);
    expect(changeRatio(10, 0)).toBeNull();
  });
  it("daysInMonthOf handles leap years", () => {
    expect(daysInMonthOf("2026-02")).toBe(28);
    expect(daysInMonthOf("2028-02")).toBe(29);
    expect(daysInMonthOf("2026-10")).toBe(31);
  });
});
