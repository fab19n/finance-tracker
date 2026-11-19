import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanTabsView } from "@/components/SectionTabs";
import { detectLeaks, WHOLE_BOOK_FINDINGS, type LeakInput } from "@/lib/analytics/leakage";
import { evaluateBills, type BillDef, type BillTx } from "@/lib/plan/bills";
import { billsPaidFrom, safeToSpend } from "@/lib/plan/safe";
import { withAccount } from "@/lib/queries/filters";
import { row } from "./helpers";

const def = (id: number, name: string, accountId: number, over: Partial<BillDef> = {}): BillDef => ({
  id,
  name,
  accountId,
  categoryId: null,
  nature: "need",
  amountMin: 10_000,
  amountMax: 10_000,
  dueDay: 1,
  matchKeywords: null,
  active: true,
  ...over,
});

const cycle = { start: "2026-09-28", end: "2026-10-27" };
const TODAY = "2026-10-09";
const bills = [
  def(1, "Rent", 1, { amountMin: 95_000, amountMax: 98_000, dueDay: 1 }),
  def(2, "Netflix", 1, { amountMin: 8_890, amountMax: 8_890, dueDay: 8 }),
  def(3, "Insurance", 2, { amountMin: 12_000, amountMax: 12_000, dueDay: 20 }),
  def(4, "Gym", 1, { active: false }),
];
const items = (txs: BillTx[] = []) => evaluateBills(bills, cycle, txs, TODAY);

describe("which bills an account pays", () => {
  it("only the bills paid from it, and never a paused one", () => {
    expect(billsPaidFrom(items(), 1).map((i) => i.bill.name)).toEqual(["Rent", "Netflix"]);
    expect(billsPaidFrom(items(), 2).map((i) => i.bill.name)).toEqual(["Insurance"]);
    expect(billsPaidFrom(items(), 3)).toEqual([]);
  });
});

describe("what is left in an account after the bills it pays", () => {
  const mine = billsPaidFrom(items(), 1);

  it("is its balance minus the highest amounts of its unpaid bills, spread over the days to payday", () => {
    const s = safeToSpend({ accountName: "Bank", balance: 200_000, items: mine, daysLeft: 19 });
    expect(s).toMatchObject({ configured: true, accountName: "Bank", balance: 200_000, reserve: 98_000 + 8_890, safe: 200_000 - 106_890, unpaidCount: 2, overdueCount: 2, daysLeft: 19 });
    expect(s.perDay).toBe(Math.round(93_110 / 19));
  });

  it("holds nothing back for a bill that is already paid", () => {
    const paid: BillTx = { id: 9, date: "2026-10-08", amount: 8_890, type: "expense", accountId: 1, item: "Netflix", billId: null };
    const s = safeToSpend({ accountName: "Bank", balance: 200_000, items: billsPaidFrom(items([paid]), 1), daysLeft: 19 });
    expect(s).toMatchObject({ reserve: 98_000, unpaidCount: 1, overdueCount: 1 });
  });

  it("goes negative when the bills need more than the account holds", () => {
    const s = safeToSpend({ accountName: "Bank", balance: 50_000, items: mine, daysLeft: 19 });
    expect(s.safe).toBe(50_000 - 106_890);
    expect(s.safe).toBeLessThan(0);
  });

  it("is just the balance for an account that pays no bills", () => {
    const s = safeToSpend({ accountName: "Cash", balance: 79_720, items: billsPaidFrom(items(), 3), daysLeft: 19 });
    expect(s).toMatchObject({ reserve: 0, safe: 79_720, unpaidCount: 0, overdueCount: 0 });
  });

  it("has no daily figure on payday itself (no days left to divide by)", () => {
    expect(safeToSpend({ accountName: "Bank", balance: 200_000, items: mine, daysLeft: 0 }).perDay).toBeNull();
  });
});

describe("narrowing a link to one account", () => {
  it("adds the account to a link into Activity, with or without a query already", () => {
    expect(withAccount("/transactions?month=all&q=latte", 2)).toBe("/transactions?month=all&q=latte&account=2");
    expect(withAccount("/transactions", 2)).toBe("/transactions?account=2");
  });

  it("leaves every other link alone, and every link when no account is chosen", () => {
    for (const href of ["/plan", "/insights#cash", "/dashboard?month=2026-09", "/transactions/export?month=all"]) expect(withAccount(href, 2)).toBe(href);
    expect(withAccount("/transactions?month=all", null)).toBe("/transactions?month=all");
    expect(withAccount("/transactions?month=all", undefined)).toBe("/transactions?month=all");
  });
});

describe("leaving findings out of an account's view", () => {
  const baseInput = (rows: LeakInput["rows"], over: Partial<LeakInput> = {}): LeakInput => ({
    rows,
    today: TODAY,
    categories: [{ id: 7, name: "Eating Out", icon: "x", monthlyBudget: 50_000 }],
    assumptions: { sp500ReturnPct: 7, horizonYears: 10 },
    cash: { unaccounted90: 45_329, withdrawn90: 120_000 },
    ...over,
  });
  // an over-budget category, wants above the guide last month, and cash that went missing, all at once
  const rows = [
    row({ date: "2026-10-03", rm: 600, cat: "Eating Out", categoryId: 7 }),
    row({ date: "2026-09-01", rm: 5000, type: "income", cat: "Salary", nature: "saving" }),
    row({ date: "2026-09-10", rm: 2100, cat: "Shopping", nature: "want" }),
  ];
  const kinds = (over: Partial<LeakInput> = {}) => detectLeaks(baseInput(rows, over)).map((i) => i.kind);

  it("shows the whole-book findings by default", () => {
    expect(kinds()).toEqual(expect.arrayContaining(["over_budget", "wants_heavy", "cash_unaccounted"]));
  });

  it("drops exactly the kinds it is told to, and nothing else", () => {
    const all = kinds();
    const without = kinds({ omit: ["over_budget", "wants_heavy"] });
    expect(without).not.toContain("over_budget");
    expect(without).not.toContain("wants_heavy");
    expect(without).toContain("cash_unaccounted");
    expect(without.length).toBe(all.length - 2);
  });

  it("names every finding that compares against the whole book", () => {
    expect([...WHOLE_BOOK_FINDINGS].sort()).toEqual(["cash_unaccounted", "over_budget", "planning_gap", "savings_drawdown", "savings_spending", "wants_heavy"]);
    expect(kinds({ omit: WHOLE_BOOK_FINDINGS })).toEqual([]);
  });
});

describe("the Plan tabs when one account is on screen", () => {
  const links = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[2], m[1]]);

  it("Overview and Bills keep the account; Shared, which is about people, does not", () => {
    const html = renderToStaticMarkup(createElement(PlanTabsView, { pathname: "/plan", account: 2 }));
    expect(links(html)).toEqual([
      ["Overview", "/plan?account=2"],
      ["Bills", "/plan/bills?account=2"],
      ["Shared", "/plan/shared"],
    ]);
  });

  it("are the plain links when no account is chosen", () => {
    const html = renderToStaticMarkup(createElement(PlanTabsView, { pathname: "/plan" }));
    expect(links(html)).toEqual([
      ["Overview", "/plan"],
      ["Bills", "/plan/bills"],
      ["Shared", "/plan/shared"],
    ]);
  });

  it("still know which tab is the current one (matched on the path, not the link)", () => {
    const html = renderToStaticMarkup(createElement(PlanTabsView, { pathname: "/plan/bills", account: 2 }));
    expect(html).toMatch(/aria-current="page"[^>]*href="\/plan\/bills\?account=2"|href="\/plan\/bills\?account=2"[^>]*aria-current="page"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
