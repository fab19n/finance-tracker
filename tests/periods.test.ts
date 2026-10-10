import { describe, expect, it } from "vitest";
import { payCyclePeriods, periodDay, periodKey, rekeyRows } from "@/lib/analytics/periods";
import { categoryBreakdown, cumulativeSpend, monthTotals, paycheckIn, type FlowRow } from "@/lib/analytics/summary";

const RM = (n: number) => Math.round(n * 100);
let n = 0;
const ids = new Map<string, number>();
const row = (date: string, type: "income" | "expense", rm: number, category = "Rent / Housing"): FlowRow => ({
  id: ++n, date, type, amount: RM(rm), categoryId: ids.get(category) ?? ids.set(category, ids.size + 1).get(category)!, categoryName: category, categoryIcon: "", nature: "need", isSystem: false, item: null, accountId: 1,
});

describe("periodKey: the month a pay cycle is named after", () => {
  it.each([
    ["2026-09-26", "2026-10-25", "2026-10"], // salary on the 26th pays for October
    ["2026-08-26", "2026-09-25", "2026-09"],
    ["2026-10-01", "2026-10-31", "2026-10"], // paid on the 1st: the same as the calendar month
    ["2026-10-05", "2026-11-04", "2026-10"],
    ["2026-09-15", "2026-10-14", "2026-09"], // a cycle that is mostly September
    ["2026-12-26", "2027-01-25", "2027-01"], // across the new year
  ])("%s to %s is %s", (start, end, key) => {
    expect(periodKey(start, end)).toBe(key);
  });
});

describe("payCyclePeriods", () => {
  // The user's pattern: paid on the 26th. Earlier pay was irregular and filed as Side Income, so only these two are Salary.
  const salaryDates = ["2026-08-26", "2026-09-26"];

  it("on 10 Oct the current cycle is 26 Sep to 25 Oct and is called October; the ones before follow, one a month", () => {
    const p = payCyclePeriods({ today: "2026-10-10", salaryDates, paydayDay: 28, count: 5 });
    expect(p.map((x) => [x.key, x.start, x.end, x.current])).toEqual([
      ["2026-10", "2026-09-26", "2026-10-25", true],
      ["2026-09", "2026-08-26", "2026-09-25", false],
      // before the first recorded salary: cut at the day you are usually paid (the 26th), NOT the stale RM setting of 28
      ["2026-08", "2026-07-26", "2026-08-25", false],
      ["2026-07", "2026-06-26", "2026-07-25", false],
      ["2026-06", "2026-05-26", "2026-06-25", false],
    ]);
  });

  it("every entry belongs to exactly one cycle: they join end to start, with no gap and no overlap", () => {
    const p = payCyclePeriods({ today: "2026-10-10", salaryDates, paydayDay: 28, count: 12 });
    for (let i = 1; i < p.length; i++) expect(p[i - 1].start).toBe(new Date(Date.parse(p[i].end) + 86_400_000).toISOString().slice(0, 10));
    expect(new Set(p.map((x) => x.key)).size).toBe(p.length);
  });

  it("on payday itself the new cycle has already begun", () => {
    const p = payCyclePeriods({ today: "2026-09-26", salaryDates, paydayDay: 28, count: 2 });
    expect(p[0]).toMatchObject({ key: "2026-10", start: "2026-09-26", current: true });
  });

  it("with no salary recorded, it is the payday set in Settings", () => {
    const p = payCyclePeriods({ today: "2026-10-10", salaryDates: [], paydayDay: 28, count: 2 });
    expect(p.map((x) => [x.key, x.start, x.end])).toEqual([["2026-10", "2026-09-28", "2026-10-27"], ["2026-09", "2026-08-28", "2026-09-27"]]);
  });

  it("when pay is late, the cycle in progress runs to today instead of ending before it", () => {
    const p = payCyclePeriods({ today: "2026-10-30", salaryDates, paydayDay: 28, count: 2 });
    expect(p[0]).toMatchObject({ start: "2026-09-26", end: "2026-10-30", key: "2026-10" });
  });
});

describe("rekeyRows: what each cycle holds", () => {
  const periods = payCyclePeriods({ today: "2026-10-10", salaryDates: ["2026-08-26", "2026-09-26"], paydayDay: 28, count: 3 });

  it("REGRESSION: the 26 Sep salary counts in October, so 1-10 Oct is not 'overspent'", () => {
    const rows = [
      row("2026-09-26", "income", 5443.3, "Salary"), // lands on payday
      row("2026-10-01", "expense", 950), // rent, a few days later
      row("2026-10-02", "expense", 500, "Loans & Insurance"),
      row("2026-10-09", "expense", 60, "Health"),
    ];
    // as a calendar month, October has no pay at all
    expect(monthTotals(rows, "2026-10")).toMatchObject({ income: 0, expense: RM(1510) });
    // as a pay cycle it has the salary, and a sensible amount left
    const t = monthTotals(rekeyRows(rows, periods), "2026-10");
    expect(t).toMatchObject({ income: RM(5443.3), expense: RM(1510), net: RM(3933.3) });
    expect(t.savingsRate).toBeCloseTo(0.7226, 3);
  });

  it("counts the days from payday: payday is day 1", () => {
    const re = rekeyRows([row("2026-09-26", "expense", 10), row("2026-10-10", "expense", 20)], periods);
    expect(re.map((r) => r.date)).toEqual(["2026-10-01", "2026-10-15"]);
  });

  it("the previous cycle keeps what was spent before payday, and entries outside every cycle are left out", () => {
    const rows = [row("2026-09-25", "expense", 40), row("2026-10-26", "expense", 99), row("2026-05-01", "expense", 5)];
    const re = rekeyRows(rows, periods);
    expect(monthTotals(re, "2026-09").expense).toBe(RM(40)); // 25 Sep is the last day of the September cycle
    expect(re).toHaveLength(1); // 26 Oct belongs to a cycle that hasn't begun; 1 May is before the cycles asked for
  });

  it("a 31-day cycle named after a 30-day month folds its last day into the 30th, so nothing falls off the charts", () => {
    // 26 Aug - 25 Sep is 31 days but is "September" (30 days): 25 Sep would be day 31
    const re = rekeyRows([row("2026-09-25", "expense", 40), row("2026-09-24", "expense", 10)], periods);
    expect(re.map((r) => r.date)).toEqual(["2026-09-30", "2026-09-30"]);
    const pace = cumulativeSpend(re, "2026-09", "2026-08", 30);
    expect(pace.find((p) => p.day === 30)!.current).toBe(RM(50)); // all of it is on the chart, on the last day September has
  });

  it("the usual breakdowns work on a cycle: categories, and 'to date' against the same day of the last one", () => {
    const rows = [
      row("2026-10-01", "expense", 950),
      row("2026-10-04", "expense", 418, "Subscriptions"),
      row("2026-09-30", "expense", 100, "Subscriptions"), // after payday on the 26th: it belongs to October's cycle
      row("2026-09-02", "expense", 30, "Subscriptions"), // day 8 of the September cycle
      row("2026-09-20", "expense", 70, "Subscriptions"), // day 26 of it
    ];
    const re = rekeyRows(rows, periods);
    expect(categoryBreakdown(re, "2026-10").map((c) => [c.name, c.total])).toEqual([["Rent / Housing", RM(950)], ["Subscriptions", RM(518)]]);
    // the same ten days of the September cycle: only the day-8 entry is in them
    expect(monthTotals(re, "2026-09", 10).expense).toBe(RM(30));
    expect(monthTotals(re, "2026-09").expense).toBe(RM(100));
  });
});

describe("periodDay", () => {
  const p = payCyclePeriods({ today: "2026-10-10", salaryDates: ["2026-08-26", "2026-09-26"], paydayDay: 28, count: 2 });
  it("is today's day number in the cycle in progress, and the whole length of a finished one", () => {
    expect(periodDay(p[0], "2026-10-10")).toBe(15); // 26 Sep is day 1
    expect(periodDay(p[1], "2026-10-10")).toBe(30); // 31 days, held to the 30 of September
  });
});

describe("paycheckIn: has real pay landed?", () => {
  it("REGRESSION: RM 0.11 of interest is not a paycheck, so it can't turn 'no pay yet' into a red 'Overspent'", () => {
    expect(paycheckIn(11, RM(5400))).toBe(false);
    expect(paycheckIn(0, RM(5400))).toBe(false);
  });
  it("a friend paying back RM 22.25 is not a paycheck either, but a salary is", () => {
    expect(paycheckIn(RM(22.25), RM(5400))).toBe(false); // under a tenth of the pay you expect (RM 540)
    expect(paycheckIn(RM(5443.3), RM(5400))).toBe(true);
    expect(paycheckIn(RM(540), RM(5400))).toBe(true);
  });
  it("with no expected pay set, anything over RM 5 counts", () => {
    expect(paycheckIn(RM(4.99), 0)).toBe(false);
    expect(paycheckIn(RM(5), 0)).toBe(true);
  });
});
