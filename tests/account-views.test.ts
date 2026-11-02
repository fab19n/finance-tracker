import { describe, expect, it } from "vitest";
import { accountBreakdown, type FlowRow } from "@/lib/analytics/summary";
import { parseTxSearch, qs } from "@/lib/queries/filters";
import { transferView } from "@/lib/transfer-view";

const row = (o: Partial<FlowRow> & Pick<FlowRow, "date" | "amount" | "accountId">): FlowRow => ({
  id: 1,
  type: "expense",
  categoryId: 1,
  categoryName: "Eating Out",
  categoryIcon: "x",
  nature: "want",
  isSystem: false,
  item: null,
  ...o,
});

describe("spending by account", () => {
  const rows = [
    row({ date: "2026-10-02", amount: 5000, accountId: 1 }),
    row({ date: "2026-10-09", amount: 15000, accountId: 1 }),
    row({ date: "2026-10-10", amount: 30000, accountId: 2 }),
    row({ date: "2026-10-11", amount: 99999, accountId: 3, type: "income" }), // income is not spending
    row({ date: "2026-09-30", amount: 77777, accountId: 3 }), // another month
  ];

  it("groups one month's expenses by the account they were paid from, biggest first, with shares", () => {
    const out = accountBreakdown(rows, "2026-10");
    expect(out.map((a) => [a.accountId, a.total, a.count])).toEqual([
      [2, 30000, 1],
      [1, 20000, 2],
    ]);
    expect(out.map((a) => a.share)).toEqual([0.6, 0.4]);
  });

  it("is empty for a month with no spending (no divide by zero)", () => {
    expect(accountBreakdown(rows, "2026-08")).toEqual([]);
    expect(accountBreakdown([row({ date: "2026-10-01", amount: 5, accountId: 1, type: "income" })], "2026-10")).toEqual([]);
  });
});

describe("a transfer from one account's point of view", () => {
  const tx = { accountId: 1, toAccountId: 2, accountName: "Bank", toAccountName: "Savings" };

  it("has no direction in the list of everything", () => {
    expect(transferView(tx, null)).toEqual({ title: "Transfer", sign: "" });
  });

  it("is money OUT on the account it left, and money IN on the account it reached", () => {
    expect(transferView(tx, 1)).toEqual({ title: "Transfer to Savings", sign: "-" });
    expect(transferView(tx, 2)).toEqual({ title: "Transfer from Bank", sign: "+" });
  });

  it("stays plain when viewing an account it did not touch", () => {
    expect(transferView(tx, 3)).toEqual({ title: "Transfer", sign: "" });
  });
});

describe("a date range in the address (how the Dashboard links a pay cycle)", () => {
  it("is read as a range that beats the month, and keeps the account", () => {
    const v = parseTxSearch({ month: "all", from: "2026-09-26", to: "2026-10-25", account: "3", category: "7" });
    expect(v.range).toEqual({ from: "2026-09-26", to: "2026-10-25" });
    expect(v.filters).toMatchObject({ from: "2026-09-26", to: "2026-10-25", accountId: 3, categoryId: 7 });
    expect(v.raw).toMatchObject({ from: "2026-09-26", to: "2026-10-25", account: "3" });
  });

  it("is absent when browsing a month or all time, and a malformed date is ignored rather than trusted", () => {
    expect(parseTxSearch({ month: "2026-10" }).range).toBeNull();
    expect(parseTxSearch({ month: "all" }).range).toBeNull();
    const bad = parseTxSearch({ month: "all", from: "26/09/2026", to: "nope" });
    expect(bad.range).toBeNull();
    expect(bad.filters.from).toBeUndefined();
  });

  it("can be open at one end", () => {
    expect(parseTxSearch({ month: "all", from: "2026-09-26" }).range).toEqual({ from: "2026-09-26", to: null });
  });

  it("survives being written back into a link (so paging and chips keep the range)", () => {
    const v = parseTxSearch({ month: "all", from: "2026-09-26", to: "2026-10-25" });
    const href = qs({ month: v.month, from: v.raw.from, to: v.raw.to, account: "2" });
    expect(parseTxSearch(Object.fromEntries(new URLSearchParams(href)))).toMatchObject({
      range: { from: "2026-09-26", to: "2026-10-25" },
      filters: { accountId: 2 },
    });
  });
});
