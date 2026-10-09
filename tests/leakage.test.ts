import { describe, expect, it } from "vitest";
import { detectLeaks, headlineSavings, type LeakInput } from "@/lib/analytics/leakage";
import type { CycleFlow } from "@/lib/plan/savings-flow";
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

  it("REGRESSION: a month recorded only from the 26th is not a baseline (it looks like a month of no spending)", () => {
    // Data starts on 27 Aug. September is complete and about the same as October, so October is NOT 'creeping'.
    // Averaging in August's empty first 9 days once reported "Subscriptions is 111% above your usual pace".
    const subs = (date: string, rm: number) => row({ date, rm, cat: "Subscriptions", nature: "want", item: "Plan" });
    const rows = [row({ date: "2026-08-27", rm: 20 }), subs("2026-09-02", 440), subs("2026-09-04", 90), subs("2026-10-02", 445), subs("2026-10-04", 90)];
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

describe("spike days", () => {
  // 40 ordinary RM 10 days, and one day with the rent on it.
  const rows = [...Array.from({ length: 40 }, (_, i) => row({ date: daysAgo(i + 1), rm: 10 })), row({ date: daysAgo(20), rm: 950, item: "Rent", cat: "Rent / Housing", nature: "need" })].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  ); // the detector wants them oldest first

  it("flags a day dominated by one huge payment", () => {
    expect(detectLeaks(baseInput(rows)).find((i) => i.kind === "spike")?.evidence.join(" ")).toMatch(/Rent/);
  });
  it("REGRESSION: but not when that payment is one of your registered bills (rent day is not a splurge)", () => {
    expect(detectLeaks(baseInput(rows, { billItems: ["Rent", "Netflix"] })).find((i) => i.kind === "spike")).toBeUndefined();
  });
  it("matches the bill name ignoring case and spaces", () => {
    expect(detectLeaks(baseInput(rows, { billItems: ["  rent "] })).find((i) => i.kind === "spike")).toBeUndefined();
  });
});

describe("savings drawdown findings (from pay-cycle flows)", () => {
  // The classic pattern: RM5,400 in, RM4,200 moved to savings, RM2,467.70 of bills, RM900 of everyday spending, top-ups to cover both.
  const cycle = (over: Partial<CycleFlow> = {}): CycleFlow => ({
    start: "2026-08-28", end: "2026-09-27", complete: true,
    income: RM(5400), deposited: RM(4200), drawn: RM(2167.7), billsPaid: RM(2467.7), billsFromSpending: RM(2467.7), variable: RM(900),
    spentFromSavings: 0, savingsSpendTop: [], paydayDeposit: RM(4200),
    leftAfterDeposit: RM(1200), planningGap: RM(1267.7), everydayFromSavings: RM(900),
    netSaved: RM(2032.3), trueSaved: RM(2032.3), trueRate: 0.376, ...over,
  });
  const find = (flows: CycleFlow[], kind: string) => detectLeaks(baseInput([], { flows })).find((i) => i.kind === kind);

  it("tells you the payday transfer leaves too little for the bills, and what you REALLY save", () => {
    const gap = find([cycle(), cycle(), cycle()], "planning_gap")!;
    // (formatRM puts a no-break space after "RM", so these match on the numbers)
    expect(gap.title).toMatch(/1,267\.70 too little/);
    expect(gap.evidence.join(" ")).toMatch(/4,200\.00 saved/);
    expect(gap.evidence.join(" ")).toMatch(/at most .{0,4}2,932\.30/); // 4,200 - 1,267.70
    expect(gap.href).toBe("/plan");
  });

  it("does not claim a saving for the planning gap: it's a distorted picture, not money lost", () => {
    const gap = find([cycle()], "planning_gap")!;
    expect(gap.monthlySaving).toBe(0);
    expect(gap.annualSaving).toBe(0);
  });

  it("flags everyday spending funded by savings, with a modest estimate (30% of it)", () => {
    const d = find([cycle(), cycle()], "savings_drawdown")!;
    expect(d.title).toMatch(/900\.00 a cycle/);
    expect(d.monthlySaving).toBe(Math.round(RM(900) * 0.3));
    expect(d.severity).toBe("medium"); // 900 < 25% of the 4,200 moved
  });

  it("is high severity when the shortfall is a big share of what you put in", () => {
    expect(find([cycle({ everydayFromSavings: RM(1500), drawn: RM(2767.7) })], "savings_drawdown")!.severity).toBe("high");
  });

  it("says nothing when the payday split covers the bills and nothing comes back out", () => {
    const clean = cycle({ drawn: 0, planningGap: 0, everydayFromSavings: 0, leftAfterDeposit: RM(3000) });
    const found = detectLeaks(baseInput([], { flows: [clean, clean] }));
    expect(found.filter((i) => i.kind === "planning_gap" || i.kind === "savings_drawdown")).toEqual([]);
  });

  it("ignores the cycle still in progress, cycles without a transfer, and tiny amounts", () => {
    expect(find([cycle({ complete: false })], "planning_gap")).toBeUndefined();
    expect(find([cycle({ deposited: 0 })], "planning_gap")).toBeUndefined();
    expect(find([cycle({ planningGap: RM(40), everydayFromSavings: RM(40), drawn: RM(80) })], "planning_gap")).toBeUndefined();
  });

  it("averages the last three completed cycles, so one odd month doesn't decide it", () => {
    const flows = [cycle({ planningGap: RM(1500) }), cycle({ planningGap: RM(1200) }), cycle({ planningGap: RM(900) }), cycle({ planningGap: RM(100000) })];
    expect(find(flows, "planning_gap")!.title).toMatch(/1,200\.00 too little/); // the 4th (oldest) is ignored
  });

  it("works without any flows at all", () => {
    expect(detectLeaks(baseInput([])).filter((i) => i.kind === "planning_gap")).toEqual([]);
  });

  describe("spending paid straight out of the savings account", () => {
    const direct = (rm: number, over: Partial<CycleFlow> = {}) =>
      cycle({
        drawn: RM(200), planningGap: 0, everydayFromSavings: RM(200), deposited: RM(4700),
        spentFromSavings: RM(rm), savingsSpendTop: [{ name: "Rent / Housing", amount: RM(973) }, { name: "Subscriptions", amount: RM(485) }], ...over,
      });

    it("names it, says what it was, and says how little of the transfer really stayed", () => {
      const f = find([direct(2664)], "savings_spending")!;
      expect(f.title).toMatch(/2,664\.00 a cycle is paid straight out of your savings/);
      expect(f.evidence.join(" ")).toMatch(/Rent \/ Housing .{0,4}973\.00/);
      expect(f.evidence.join(" ")).toMatch(/only about .{0,4}1,836\.00/); // 4,700 - 200 - 2,664
      expect(f.severity).toBe("high"); // well over a quarter of what you move
      expect(f.href).toBe("/plan");
    });

    it("claims no saving: it is spending you were doing anyway, paid from the wrong place", () => {
      const f = find([direct(2664)], "savings_spending")!;
      expect([f.monthlySaving, f.annualSaving]).toEqual([0, 0]);
    });

    it("is medium when it is a smaller share, and silent under RM 300", () => {
      expect(find([direct(600)], "savings_spending")!.severity).toBe("medium");
      expect(find([direct(250)], "savings_spending")).toBeUndefined();
    });

    it("says savings SHRINK when more went out than was moved in", () => {
      const f = find([direct(5000)], "savings_spending")!;
      expect(f.evidence.join(" ")).toMatch(/shrinks by about .{0,4}500\.00/); // 4,700 - 200 - 5,000 = -500
    });

    it("the planning gap only counts bills paid from the spending account", () => {
      // Rent etc. paid straight from savings never needed a top-up, so they can't make the payday split 'too little'.
      const gap = cycle({ billsPaid: RM(2467.7), billsFromSpending: RM(800), leftAfterDeposit: RM(1200), planningGap: 0, drawn: RM(215), everydayFromSavings: RM(215) });
      expect(find([gap, gap], "planning_gap")).toBeUndefined();
    });
  });
});

const RM = (n: number) => Math.round(n * 100);
