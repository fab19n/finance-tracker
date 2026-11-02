import { describe, expect, it } from "vitest";
import { accountLedger, balanceAtEndOf, balanceDelta, balanceHistory, type LedgerEntry } from "@/lib/analytics/ledger";
import { statementRows, STATEMENT_HEADER, type StatementSource } from "@/lib/statement";

// Account 1 opens with RM 100.00. Account 2 is the other end of two transfers (and has an expense of its own).
const OPENING = 10_000;
const e = (id: number, date: string, type: LedgerEntry["type"], amount: number, accountId: number, toAccountId: number | null = null): LedgerEntry => ({
  id,
  date,
  type,
  amount,
  accountId,
  toAccountId,
});
const entries: LedgerEntry[] = [
  e(1, "2026-10-01", "income", 50_000, 1),
  e(2, "2026-10-02", "expense", 1_500, 1),
  e(3, "2026-10-02", "expense", 500, 1),
  e(4, "2026-10-05", "transfer", 20_000, 1, 2),
  e(5, "2026-10-07", "transfer", 3_000, 2, 1),
  e(6, "2026-10-08", "expense", 999, 2),
  e(7, "2026-10-20", "income", 1_000, 1),
];

describe("what an entry does to one account's balance", () => {
  it("income in is +, spending is -, and a transfer is - where it left and + where it arrived", () => {
    expect(balanceDelta(entries[0], 1)).toBe(50_000);
    expect(balanceDelta(entries[1], 1)).toBe(-1_500);
    expect(balanceDelta(entries[3], 1)).toBe(-20_000);
    expect(balanceDelta(entries[3], 2)).toBe(20_000);
  });

  it("is 0 on an account the entry doesn't touch", () => {
    expect(balanceDelta(entries[5], 1)).toBe(0);
    expect(balanceDelta(entries[3], 3)).toBe(0);
  });
});

describe("an account's ledger", () => {
  it("keeps only its own entries, oldest first (the id breaks a tie within a day), with the balance after each", () => {
    const lines = accountLedger(OPENING, [...entries].reverse(), 1);
    expect(lines.map((l) => [l.id, l.delta, l.balance])).toEqual([
      [1, 50_000, 60_000],
      [2, -1_500, 58_500],
      [3, -500, 58_000],
      [4, -20_000, 38_000],
      [5, 3_000, 41_000],
      [7, 1_000, 42_000],
    ]);
  });

  it("ends on the account's balance: opening + everything that touched it", () => {
    const total = entries.reduce((s, x) => s + balanceDelta(x, 1), OPENING);
    expect(accountLedger(OPENING, entries, 1).at(-1)!.balance).toBe(total);
    // and the other account's side of the same two transfers
    expect(accountLedger(0, entries, 2).at(-1)!.balance).toBe(20_000 - 3_000 - 999);
  });

  it("reads the balance at the end of a day, counting that day's entries", () => {
    const lines = accountLedger(OPENING, entries, 1);
    expect(balanceAtEndOf(OPENING, lines, "2026-09-30")).toBe(OPENING);
    expect(balanceAtEndOf(OPENING, lines, "2026-10-02")).toBe(58_000);
    expect(balanceAtEndOf(OPENING, lines, "2026-10-04")).toBe(58_000);
    expect(balanceAtEndOf(OPENING, lines, "2026-12-31")).toBe(42_000);
  });
});

describe("how the balance moved through a period", () => {
  it("gives where it started, where it ended, the change, and the lowest and highest day-end", () => {
    const h = balanceHistory(OPENING, entries, 1, { from: "2026-10-01", to: "2026-10-10" });
    expect([h.start, h.end, h.change]).toEqual([10_000, 41_000, 31_000]);
    expect(h.low).toEqual({ date: "2026-10-05", balance: 38_000 });
    expect(h.high).toEqual({ date: "2026-10-01", balance: 60_000 });
    expect(h.points.map((p) => p.balance)).toEqual([60_000, 58_000, 58_000, 58_000, 38_000, 38_000, 41_000, 41_000, 41_000, 41_000]);
  });

  it("starts from the balance the day before, so a later period still counts everything earlier", () => {
    const h = balanceHistory(OPENING, entries, 1, { from: "2026-10-05", to: "2026-10-07" });
    expect([h.start, h.end]).toEqual([58_000, 41_000]);
    expect([h.low?.balance, h.high?.balance]).toEqual([38_000, 41_000]);
  });

  it("judges a day by where it ENDED, not by the order of its entries", () => {
    // 2 Oct has two lines (58,500 then 58,000): the low of that day is its last
    const h = balanceHistory(OPENING, entries, 1, { from: "2026-10-02", to: "2026-10-03" });
    expect(h.low).toEqual({ date: "2026-10-02", balance: 58_000 });
    expect(h.high).toEqual({ date: "2026-10-02", balance: 58_000 });
  });

  it("leaves out entries dated after the period", () => {
    const h = balanceHistory(OPENING, entries, 1, { from: "2026-10-01", to: "2026-10-04" });
    expect(h.end).toBe(58_000);
  });

  it("starts at the first entry when no start is given, and pulls a start after the end back to the end", () => {
    expect(balanceHistory(OPENING, entries, 1, { from: null, to: "2026-10-10" }).from).toBe("2026-10-01");
    const h = balanceHistory(OPENING, entries, 1, { from: "2026-12-01", to: "2026-10-10" });
    expect([h.from, h.to, h.points.length, h.start, h.end]).toEqual(["2026-10-10", "2026-10-10", 1, 41_000, 41_000]);
  });

  it("is a flat line at the opening balance when nothing ever happened", () => {
    const h = balanceHistory(5_000, [], 1, { from: "2026-10-01", to: "2026-10-05" });
    expect(h.points.map((p) => p.balance)).toEqual([5_000, 5_000, 5_000, 5_000, 5_000]);
    expect([h.low, h.high, h.change]).toEqual([null, null, 0]);
  });

  it("samples a long period down to the cap, keeping both ends", () => {
    const h = balanceHistory(OPENING, entries, 1, { from: "2026-01-01", to: "2026-12-31" }, 10);
    expect(h.points.length).toBeLessThanOrEqual(10);
    expect(h.points[0].date).toBe("2026-01-01");
    expect(h.points.at(-1)).toEqual({ date: "2026-12-31", balance: 42_000 });
    // the extremes come from every active day, not from the sample
    expect(h.low).toEqual({ date: "2026-10-05", balance: 38_000 });
  });
});

describe("a statement", () => {
  const src = (id: number, date: string, type: StatementSource["type"], extra: Partial<StatementSource> = {}): StatementSource => ({
    id,
    date,
    type,
    item: null,
    note: null,
    accountId: 1,
    accountName: "Bank",
    toAccountId: null,
    toAccountName: null,
    categoryName: null,
    ...extra,
  });
  // The rows as the Activity list has them: newest first.
  const rows: StatementSource[] = [
    src(7, "2026-10-20", "income", { item: "Refund", categoryName: "Reimbursements" }),
    src(5, "2026-10-07", "transfer", { accountId: 2, accountName: "Savings", toAccountId: 1, toAccountName: "Bank" }),
    src(4, "2026-10-05", "transfer", { toAccountId: 2, toAccountName: "Savings", note: "monthly" }),
    src(3, "2026-10-02", "expense", { item: "Teh tarik", categoryName: "Eating Out" }),
    src(2, "2026-10-02", "expense", { categoryName: "Groceries" }),
    src(1, "2026-10-01", "income", { item: "Salary", categoryName: "Salary" }),
  ];

  it("runs oldest first, money in and out in their own columns, with the balance after each line", () => {
    const out = statementRows({ opening: OPENING, entries, accountId: 1, rows, from: null });
    expect(STATEMENT_HEADER).toHaveLength(out[0].length);
    expect(out[0]).toEqual(["2026-10-01", "Opening balance", "", "", "", "100.00", ""]);
    expect(out.slice(1).map((r) => [r[0], r[1], r[3], r[4], r[5]])).toEqual([
      ["2026-10-01", "Salary", "500.00", "", "600.00"],
      ["2026-10-02", "Groceries", "", "15.00", "585.00"], // no item: the category names it
      ["2026-10-02", "Teh tarik", "", "5.00", "580.00"],
      ["2026-10-05", "Transfer to Savings", "", "200.00", "380.00"],
      ["2026-10-07", "Transfer from Savings", "30.00", "", "410.00"],
      ["2026-10-20", "Refund", "10.00", "", "420.00"],
    ]);
    expect(out[4][6]).toBe("monthly"); // the note travels
    expect(out[4][2]).toBe(""); // a transfer has no category
  });

  it("brings the balance forward when it starts later", () => {
    const later = rows.filter((r) => r.date >= "2026-10-05");
    const out = statementRows({ opening: OPENING, entries, accountId: 1, rows: later, from: "2026-10-05" });
    expect(out[0]).toEqual(["2026-10-05", "Balance brought forward", "", "", "", "580.00", ""]);
    expect(out[1][5]).toBe("380.00");
  });

  it("filtering the list leaves gaps but never changes a balance", () => {
    const expensesOnly = rows.filter((r) => r.type === "expense");
    const out = statementRows({ opening: OPENING, entries, accountId: 1, rows: expensesOnly, from: null });
    expect(out.slice(1).map((r) => r[5])).toEqual(["585.00", "580.00"]); // the same as in the full statement
  });

  it("ends on the account's balance when everything is listed", () => {
    const out = statementRows({ opening: OPENING, entries, accountId: 1, rows, from: null });
    expect(out.at(-1)![5]).toBe(((OPENING + entries.reduce((s, x) => s + balanceDelta(x, 1), 0)) / 100).toFixed(2));
  });

  it("skips a row that is not on the account rather than inventing a balance for it", () => {
    const stranger = src(99, "2026-10-09", "expense", { accountId: 3, item: "Elsewhere" });
    const out = statementRows({ opening: OPENING, entries, accountId: 1, rows: [stranger, ...rows], from: null });
    expect(out.some((r) => r[1] === "Elsewhere")).toBe(false);
  });
});
