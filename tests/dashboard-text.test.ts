import { describe, expect, it } from "vitest";
import {
  budgetAmounts,
  budgetLabel,
  budgetNote,
  daysLeftText,
  heroSizeClass,
  kpiSizeClass,
  leftToSpendCaption,
  meterAria,
  overBudgetBanner,
  periodName,
  periodSubtitle,
  praiseWants,
  shareLabel,
} from "@/lib/analytics/dashboard-text";
import { detectLeaks, headlineSavings, slugId, type LeakInput } from "@/lib/analytics/leakage";
import { row } from "./helpers";

/** RM figures use a no-break space; compare with a plain one. */
const plain = (t: string) => t.replace(/\s/g, " ");

const b = { name: "Eating Out", spent: 44_000, budget: 50_000, status: "ok" as const, settled: false, projected: 48_000, billsDue: 0 };

describe("meterAria", () => {
  it("holds the value to the scale and says the real figure", () => {
    const m = meterAria(1.3, 0.5);
    expect(m.now).toBe(100);
    expect(m.text).toBe("130% used, over budget");
  });
  it("explains the pace tick in words", () => {
    expect(meterAria(0.62, 0.5)).toEqual({ now: 62, text: "62% used; an even pace would be 50%" });
  });
  it("leaves the pace out when there is none (a settled category)", () => {
    expect(meterAria(0.4).text).toBe("40% used");
  });
  it("never goes below 0", () => {
    expect(meterAria(-1).now).toBe(0);
  });
});

describe("row names carry the figures", () => {
  it("budget", () => {
    expect(plain(budgetLabel(b))).toBe("Eating Out: RM 440.00 of RM 500.00 budget, on track. See its entries");
    expect(plain(budgetLabel({ ...b, spent: 60_000, status: "over" }))).toContain("over by RM 100.00");
    expect(plain(budgetLabel({ ...b, status: "watch" }))).toContain("on pace to reach RM 480.00");
    expect(plain(budgetLabel({ ...b, billsDue: 9_000 }))).toContain("RM 90.00 in bills still due");
  });
  it("category and account", () => {
    expect(plain(shareLabel("Eating Out", 44_000, 0.131))).toMatch(/^Eating Out: RM 440\.00 spent, 13(\.\d)?%\. See its entries$/);
  });
  it("a budget row says what is spent of the limit, and only adds a note when there is a fact", () => {
    expect(plain(budgetAmounts(64_000, 70_000))).toBe("RM 640 of 700");
    expect(budgetNote(b)).toBeNull();
    expect(plain(budgetNote({ ...b, status: "watch" })!)).toBe("On pace to reach RM 480.00");
    expect(plain(budgetNote({ ...b, status: "over", spent: 60_000 })!)).toBe("Over budget by RM 100.00");
    expect(budgetNote({ ...b, settled: true })).toBe("Bills paid: nothing more due");
    expect(plain(budgetNote({ ...b, billsDue: 5_000 })!)).toBe("On track · RM 50.00 in bills still due");
  });

});

describe("left to spend wording", () => {
  it("counts days to payday, and says when payday is due", () => {
    expect(daysLeftText(12, "payday")).toBe("12 days to payday");
    expect(daysLeftText(1, "payday")).toBe("1 day to payday");
    expect(daysLeftText(5, "payday", true)).toBe("Payday due");
    expect(daysLeftText(3, "month")).toBe("3 days left this month");
  });
  it("gives a daily figure, or says nothing is left", () => {
    expect(plain(leftToSpendCaption(124_000, 10_333, 12))).toBe("RM 103.33 a day for the next 12 days");
    expect(leftToSpendCaption(-34_000, null, 4)).toBe("Nothing left for the next 4 days");
    expect(leftToSpendCaption(-100, -25, 1)).toBe("Nothing left for the next 1 day");
    expect(leftToSpendCaption(5_000, null, 0, true)).toBe("after the bills still to pay");
  });
  it("names the worst over-budget category in a sentence", () => {
    expect(plain(overBudgetBanner({ name: "Eating Out", spent: 58_000, budget: 50_000 }, 4))).toBe("Eating Out is RM 80.00 over its budget with 4 days to payday.");
    expect(plain(overBudgetBanner({ name: "Eating Out", spent: 58_000, budget: 50_000 }, null, true))).toBe("Eating Out is RM 80.00 over its budget and payday is due.");
  });
});

describe("wording", () => {
  it("names a period as a month, never as a day", () => {
    expect(periodName("2026-10", "2026-10", false)).toBe("Oct");
    expect(periodName("2026-10", "2026-10", true)).toBe("Oct cycle");
    expect(periodName("2025-12", "2026-02", false)).toBe("Dec ’25");
  });
  it("does not repeat the cycle's range in the subtitle", () => {
    expect(periodSubtitle({ cycle: true, isCurrent: false, dayNow: 31, daysTotal: 31 })).toBe("Pay cycle · 31 days, complete");
    expect(periodSubtitle({ account: "Cash", cycle: false, isCurrent: true, dayNow: 9, daysTotal: 31 })).toBe("Cash · Calendar month · day 9 of 31");
  });
  it("holds praise back early in the period", () => {
    expect(praiseWants(true, 3, 30)).toBe(false);
    expect(praiseWants(true, 20, 30)).toBe(true);
    expect(praiseWants(false, 30, 30)).toBe(true);
  });
  it("steps a long figure down so it fits", () => {
    expect(kpiSizeClass("RM 1,234")).toContain("17px");
    expect(kpiSizeClass("RM 123,456")).toContain("15px");
    expect(kpiSizeClass("RM 1,234,567")).toContain("13px");
    expect(heroSizeClass("RM 1,234")).toContain("38px");
    expect(heroSizeClass("RM 1,234,567")).toContain("26px");
  });
});

const input = (rows: LeakInput["rows"], over: Partial<LeakInput> = {}): LeakInput => ({
  rows,
  today: "2026-10-20",
  categories: [],
  assumptions: { sp500ReturnPct: 7, horizonYears: 10 },
  cash: { unaccounted90: 0, withdrawn90: 0 },
  ...over,
});

describe("findings", () => {
  it("a budget only on pace to go over claims no yearly saving", () => {
    // RM 300 by day 10 of a 31-day month against a RM 600 budget: projected about RM 930, spent still under it.
    const rows = [row({ date: "2026-10-05", rm: 150, cat: "Eating Out", categoryId: 7 }), row({ date: "2026-10-10", rm: 150, cat: "Eating Out", categoryId: 7 })];
    const f = detectLeaks({ ...input(rows, { categories: [{ id: 7, name: "Eating Out", icon: "x", monthlyBudget: 60_000 }] }), today: "2026-10-10" }).find((i) => i.kind === "over_budget");
    expect(f?.title).toContain("on pace");
    expect(f?.annualSaving).toBe(0);
  });
  it("the headline names the findings it counts", () => {
    const mk = (id: string, annual: number) => ({ id, annualSaving: annual, monthlySaving: annual / 12, investedValue: annual }) as never;
    const h = headlineSavings([mk("a", 100), mk("b", 0), mk("c", 300), mk("d", 200), mk("e", 50)]);
    expect(h.ids).toEqual(["c", "d", "a"]);
    expect(h.count).toBe(3);
  });
  it("element ids made from names are valid", () => {
    expect(slugId("h", "creep-Eating Out")).toBe("h-creep-eating-out");
  });
});
