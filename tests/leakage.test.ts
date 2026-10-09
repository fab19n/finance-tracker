import { describe, expect, it } from "vitest";
import { detectLeaks, headlineSavings, type LeakInput } from "@/lib/analytics/leakage";
import { row } from "./helpers";

const TODAY = "2026-10-09";
const baseInput = (rows: LeakInput["rows"], over: Partial<LeakInput> = {}): LeakInput => ({
  rows,
  today: TODAY,
  categories: [],
  assumptions: { sp500ReturnPct: 7, horizonYears: 10 },
  cash: { unaccounted90: 0, withdrawn90: 0 },
  ...over,
});

const daysAgo = (n: number) => new Date(Date.parse(TODAY) - n * 86_400_000).toISOString().slice(0, 10);

describe("category creep (like-for-like)", () => {
  it("REGRESSION: a fixed monthly bill paid on the 1st is not 'creep'", () => {
    // Linear extrapolation once called a single RM1,200 rent payment on the 1st "244% above usual".
    const rent = ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].map((date) =>
      row({ date, rm: 1200, cat: "Rent / Housing", nature: "need", item: "Rent" }),
    );
    const found = detectLeaks(baseInput(rent));
    expect(found.filter((i) => i.kind === "category_creep")).toEqual([]);
  });

  it("flags real creep: spending well above the usual pace for this point in the month", () => {
    const rows = [
      // Usual: RM100 in the first 8 days, RM200 later => RM300 a month
      ...["2026-07", "2026-08", "2026-09"].flatMap((m) => [
        row({ date: `${m}-02`, rm: 50 }),
        row({ date: `${m}-06`, rm: 50 }),
        row({ date: `${m}-15`, rm: 100 }),
        row({ date: `${m}-24`, rm: 100 }),
      ]),
      // This month: RM220 already by day 9, in several purchases
      ...[1, 2, 3, 5, 6, 7, 8].map((d) => row({ date: `2026-10-0${d}`, rm: 220 / 7 })),
    ];
    const [creep] = detectLeaks(baseInput(rows)).filter((i) => i.kind === "category_creep");
    expect(creep).toBeDefined();
    expect(creep.title).toMatch(/Eating Out/);
    expect(creep.monthlySaving).toBeGreaterThan(10_000); // about RM120 over the usual pace
    expect(creep.evidence.join(" ")).toMatch(/usually spend/);
  });

  it("REGRESSION: a single big purchase is flagged but never annualised into a 'saving'", () => {
    const rows = [
      ...["2026-07-10", "2026-08-10", "2026-09-10"].map((date) => row({ date, rm: 100, cat: "Shopping" })),
      row({ date: "2026-10-04", rm: 389.9, cat: "Shopping", item: "Shopee haul" }),
    ];
    const found = detectLeaks(baseInput(rows)).find((i) => i.id === "oneoff-Shopping");
    expect(found).toBeDefined();
    expect(found!.title).toMatch(/Shopee haul/);
    expect(found!.monthlySaving).toBe(0);
    expect(found!.annualSaving).toBe(0);
  });

  it("stays quiet in the first days of a month and with under two months of history", () => {
    const rows = [row({ date: "2026-09-10", rm: 50 }), row({ date: "2026-10-02", rm: 900 })];
    expect(detectLeaks(baseInput(rows, { today: "2026-10-03" })).filter((i) => i.kind === "category_creep")).toEqual([]);
    expect(detectLeaks(baseInput(rows)).filter((i) => i.kind === "category_creep")).toEqual([]);
  });
});

describe("small but frequent items", () => {
  it("flags a daily latte with its yearly cost and what halving it saves", () => {
    const rows = Array.from({ length: 40 }, (_, i) => row({ date: daysAgo(i * 2), rm: 14.5, item: "Starbucks latte" }));
    const [hit] = detectLeaks(baseInput(rows)).filter((i) => i.kind === "small_frequent");
    expect(hit.title).toMatch(/Starbucks latte: 40 times/);
    // 40 x 14.50 = RM580 in 90 days => ~RM193/month; halved ~RM97/month
    expect(hit.monthlySaving).toBeGreaterThan(9_000);
    expect(hit.monthlySaving).toBeLessThan(10_000);
    // monthly and yearly are each rounded to a whole sen from the same unrounded figure
    expect(Math.abs(hit.annualSaving - hit.monthlySaving * 12)).toBeLessThanOrEqual(12);
  });

  it("ignores occasional purchases and big-ticket items", () => {
    const occasional = Array.from({ length: 5 }, (_, i) => row({ date: daysAgo(i * 10), rm: 14.5, item: "Cake" }));
    const bigTicket = Array.from({ length: 13 }, (_, i) => row({ date: daysAgo(i * 6), rm: 90, item: "Dinner" }));
    expect(detectLeaks(baseInput([...occasional, ...bigTicket])).filter((i) => i.kind === "small_frequent")).toEqual([]);
  });

  it("shows the top 3 habits and folds the rest into one card", () => {
    const habit = (item: string, rm: number) =>
      Array.from({ length: 30 }, (_, i) => row({ date: daysAgo(i * 3), rm, item }));
    const rows = [habit("A", 20), habit("B", 18), habit("C", 16), habit("D", 14), habit("E", 12)].flat();
    const cards = detectLeaks(baseInput(rows)).filter((i) => i.kind === "small_frequent");
    expect(cards).toHaveLength(4);
    expect(cards.some((c) => c.id === "frequent-rest")).toBe(true);
  });
});

describe("subscriptions", () => {
  it("sums discretionary recurring charges and leaves fixed needs out", () => {
    const rows = [
      ...["2026-07-08", "2026-08-08", "2026-09-08", "2026-10-08"].map((date) =>
        row({ date, rm: 55.9, item: "Netflix", cat: "Subscriptions", nature: "want" }),
      ),
      ...["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].map((date) =>
        row({ date, rm: 1200, item: "Rent", cat: "Rent / Housing", nature: "need" }),
      ),
    ];
    const subs = detectLeaks(baseInput(rows)).find((i) => i.kind === "subscriptions")!;
    expect(subs.title).toMatch(/1 recurring charge cost/);
    expect(subs.evidence.join(" ")).toMatch(/Netflix/);
    expect(subs.evidence.join(" ")).not.toMatch(/Rent/);
    expect(subs.monthlySaving).toBe(Math.round(5590 * 0.3));
  });
});

describe("budgets, wants and cash", () => {
  it("flags a category that is over its budget", () => {
    const rows = [row({ date: "2026-10-03", rm: 600, cat: "Eating Out", categoryId: 7 })];
    const found = detectLeaks(
      baseInput(rows, { categories: [{ id: 7, name: "Eating Out", icon: "x", monthlyBudget: 50_000 }] }),
    ).find((i) => i.kind === "over_budget")!;
    expect(found.severity).toBe("high");
    expect(found.monthlySaving).toBe(10_000);
  });

  it("flags wants above the 30% guide for the last complete month", () => {
    const rows = [
      row({ date: "2026-09-01", rm: 5000, type: "income", cat: "Salary", nature: "saving" }),
      row({ date: "2026-09-10", rm: 2100, cat: "Shopping", nature: "want" }),
    ];
    const found = detectLeaks(baseInput(rows)).find((i) => i.kind === "wants_heavy")!;
    expect(found.severity).toBe("high"); // 42% of income
    expect(found.monthlySaving).toBe(60_000); // 2100 - 30% of 5000
  });

  it("reports unaccounted cash only above the threshold", () => {
    expect(detectLeaks(baseInput([], { cash: { unaccounted90: 4_000, withdrawn90: 100_000 } }))).toEqual([]);
    const found = detectLeaks(baseInput([], { cash: { unaccounted90: 45_329, withdrawn90: 120_000 } })).find(
      (i) => i.kind === "cash_unaccounted",
    )!;
    expect(found.severity).toBe("high");
    expect(found.title).toMatch(/453\.29/);
  });
});

describe("shared behaviour", () => {
  it("'if invested' compounds the monthly saving over the horizon", () => {
    const rows = Array.from({ length: 40 }, (_, i) => row({ date: daysAgo(i * 2), rm: 14.5, item: "Starbucks latte" }));
    const [hit] = detectLeaks(baseInput(rows)).filter((i) => i.kind === "small_frequent");
    expect(hit.investedValue).toBeGreaterThan(hit.monthlySaving * 12 * 10);
    const flat = detectLeaks(baseInput(rows, { assumptions: { sp500ReturnPct: 0, horizonYears: 10 } })).find(
      (i) => i.kind === "small_frequent",
    )!;
    expect(Math.abs(flat.investedValue - flat.monthlySaving * 120)).toBeLessThanOrEqual(120);
  });

  it("sorts high severity first, and headlineSavings sums the top findings by yearly value", () => {
    const rows = [
      ...Array.from({ length: 40 }, (_, i) => row({ date: daysAgo(i * 2), rm: 14.5, item: "Starbucks latte" })),
      ...Array.from({ length: 30 }, (_, i) => row({ date: daysAgo(i * 3), rm: 12, item: "Kopi" })),
    ];
    const found = detectLeaks(baseInput(rows, { cash: { unaccounted90: 45_329, withdrawn90: 120_000 } }));
    const ranks = found.map((i) => ({ high: 0, medium: 1, low: 2 })[i.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    const top = [...found].sort((a, b) => b.annualSaving - a.annualSaving).slice(0, 3);
    expect(headlineSavings(found).annual).toBe(top.reduce((s, i) => s + i.annualSaving, 0));
  });

  it("finds nothing in an empty ledger", () => {
    expect(detectLeaks(baseInput([]))).toEqual([]);
  });
});
