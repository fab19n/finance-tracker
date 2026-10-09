import { describe, expect, it } from "vitest";
import { classifyRows, cleanItem, rowKeys, rulePattern, type ClassifyContext, type ExistingTx } from "@/lib/import/classify";
import type { StatementRow } from "@/lib/import/types";
import type { BillDef } from "@/lib/plan/bills";

const RM = (n: number) => Math.round(n * 100);
const MAIN = 1;
const SAVINGS = 2;
const CASH = 3;

const categories = [
  ["Transport & Fuel", "expense"], ["Eating Out", "expense"], ["Groceries", "expense"], ["Subscriptions", "expense"],
  ["Rent / Housing", "expense"], ["Bills & Utilities", "expense"], ["Miscellaneous", "expense"], ["Shopping", "expense"],
  ["Salary", "income"], ["Other Income", "income"], ["Investment Income", "income"],
].map(([name, type], i) => ({ id: i + 1, name: name as string, type: type as "income" | "expense" }));
const cat = (name: string) => categories.find((c) => c.name === name)!.id;

const bill = (id: number, name: string, min: number, max: number, keywords: string | null, category: string): BillDef => ({
  id, name, accountId: MAIN, categoryId: cat(category), nature: "need", amountMin: RM(min), amountMax: RM(max),
  dueDay: null, matchKeywords: keywords, active: true,
});
const bills = [
  bill(1, "Rent", 950, 980, null, "Rent / Housing"), // paid to a person: nothing on the statement identifies it
  bill(2, "Netflix", 88.9, 88.9, "netflix", "Subscriptions"),
  bill(3, "Parents electricity", 65, 75, "tnb, tenaga", "Bills & Utilities"),
];

const ctx = (over: Partial<ClassifyContext> = {}): ClassifyContext => ({
  accountId: MAIN,
  categories,
  accounts: [{ id: MAIN, type: "bank" }, { id: SAVINGS, type: "bank" }, { id: CASH, type: "cash" }],
  bills,
  rules: [],
  existing: [],
  expectedIncome: RM(5400),
  isSpendingAccount: true,
  ...over,
});

let i = 0;
const row = (description: string, rm: number, date = "2026-09-10"): StatementRow => ({
  index: i++, date, description, amount: RM(rm), balance: null, signedBy: "balance",
});
const one = (r: StatementRow, c = ctx()) => classifyRows([r], c)[0].proposal;

describe("1. duplicates are skipped, so re-importing is safe", () => {
  it("skips a line whose fingerprint was imported before", () => {
    const r = row("PETRONAS 1234", -62.5);
    const [key] = rowKeys([r], MAIN);
    const existing: ExistingTx[] = [{ id: 9, date: r.date, amount: RM(62.5), type: "expense", accountId: MAIN, toAccountId: null, importKey: key }];
    expect(one(r, ctx({ existing }))).toMatchObject({ kind: "skip", source: "duplicate", reason: expect.stringMatching(/Already imported/) });
  });

  it("skips a line you already typed in by hand (same account, amount, within 2 days)", () => {
    const existing: ExistingTx[] = [{ id: 9, date: "2026-09-09", amount: RM(62.5), type: "expense", accountId: MAIN, toAccountId: null, importKey: null }];
    expect(one(row("PETRONAS", -62.5, "2026-09-10"), ctx({ existing }))).toMatchObject({ kind: "skip", source: "duplicate" });
  });

  it("one existing entry absorbs only ONE statement line: two identical coffees, one recorded", () => {
    const existing: ExistingTx[] = [{ id: 9, date: "2026-09-10", amount: RM(14.5), type: "expense", accountId: MAIN, toAccountId: null, importKey: null }];
    const out = classifyRows([row("STARBUCKS", -14.5), row("STARBUCKS", -14.5)], ctx({ existing }));
    expect(out.map((r) => r.proposal.kind)).toEqual(["skip", "expense"]);
  });

  it("doesn't confuse different amounts, different accounts or far-apart dates", () => {
    const existing: ExistingTx[] = [
      { id: 1, date: "2026-09-10", amount: RM(60), type: "expense", accountId: MAIN, toAccountId: null, importKey: null },
      { id: 2, date: "2026-09-10", amount: RM(62.5), type: "expense", accountId: SAVINGS, toAccountId: null, importKey: null },
      { id: 3, date: "2026-08-01", amount: RM(62.5), type: "expense", accountId: MAIN, toAccountId: null, importKey: null },
    ];
    expect(one(row("PETRONAS", -62.5), ctx({ existing })).kind).toBe("expense");
  });

  it("the savings statement's credit is recognised as the transfer you already recorded from the main account", () => {
    const existing: ExistingTx[] = [{ id: 5, date: "2026-09-28", amount: RM(4200), type: "transfer", accountId: MAIN, toAccountId: SAVINGS, importKey: null }];
    const p = one(row("CREDIT TRANSFER", 4200, "2026-09-29"), ctx({ accountId: SAVINGS, isSpendingAccount: false, existing }));
    expect(p).toMatchObject({ kind: "skip", source: "duplicate" });
  });

  it("and the reverse: the main statement's debit matches a transfer already recorded", () => {
    const existing: ExistingTx[] = [{ id: 5, date: "2026-09-28", amount: RM(4200), type: "transfer", accountId: MAIN, toAccountId: SAVINGS, importKey: null }];
    expect(one(row("TRANSFER TO A/C", -4200, "2026-09-28"), ctx({ existing })).kind).toBe("skip");
  });
});

describe("2. rules you taught it win", () => {
  it("a transfer rule marks a payee as your own account", () => {
    const rules = [{ pattern: "transfer to a c", kind: "transfer" as const, categoryId: null, item: "To savings", billId: null, transferAccountId: SAVINGS }];
    expect(one(row("TRANSFER TO A/C 112233445566 MR TAN", -1800), ctx({ rules }))).toMatchObject({
      kind: "transfer", transferAccountId: SAVINGS, item: "To savings", source: "rule", confidence: "high",
    });
  });
  it("beats a built-in merchant rule", () => {
    const rules = [{ pattern: "shell", kind: "expense" as const, categoryId: cat("Eating Out"), item: "Shell Select snacks", billId: null, transferAccountId: null }];
    expect(one(row("SHELL SELECT", -8), ctx({ rules }))).toMatchObject({ categoryId: cat("Eating Out"), source: "rule" });
  });
  it("the longest (most specific) rule wins", () => {
    const rules = [
      { pattern: "grab", kind: "expense" as const, categoryId: cat("Transport & Fuel"), item: "Grab", billId: null, transferAccountId: null },
      { pattern: "grab food", kind: "expense" as const, categoryId: cat("Eating Out"), item: "Grab Food", billId: null, transferAccountId: null },
    ];
    expect(one(row("GRAB FOOD ORDER", -25), ctx({ rules })).item).toBe("Grab Food");
  });
  it("an 'expense' rule never fires on money coming in", () => {
    const rules = [{ pattern: "shopee", kind: "expense" as const, categoryId: cat("Shopping"), item: "Shopee", billId: null, transferAccountId: null }];
    expect(one(row("SHOPEE REFUND", 30), ctx({ rules })).source).not.toBe("rule");
  });
  it("a rule can link a bill", () => {
    const rules = [{ pattern: "bill payment 998", kind: "expense" as const, categoryId: null, item: null, billId: 3, transferAccountId: null }];
    expect(one(row("BILL PAYMENT 998", -70), ctx({ rules }))).toMatchObject({ billId: 3, item: "Parents electricity", categoryId: cat("Bills & Utilities") });
  });
});

describe("3. recurring bills", () => {
  it("matches on statement keywords with an amount in range: high confidence", () => {
    expect(one(row("NETFLIX.COM SINGAPORE", -88.9))).toMatchObject({ billId: 2, item: "Netflix", source: "bill", confidence: "high" });
    expect(one(row("TNB BILL PAYMENT", -68))).toMatchObject({ billId: 3, confidence: "high" });
  });
  it("still links by keyword when the amount is unusual, but asks you to look (low confidence)", () => {
    expect(one(row("NETFLIX.COM", -120))).toMatchObject({ billId: 2, confidence: "low", reason: expect.stringMatching(/unusual/) });
  });
  it("recognises a keyword-less bill (rent to a person) from its amount alone, flagged for confirmation", () => {
    expect(one(row("DUITNOW TRANSFER MR LANDLORD", -965))).toMatchObject({ billId: 1, source: "bill", confidence: "low" });
  });
  it("...but a similar-looking amount outside the bill's range is not rent", () => {
    expect(one(row("DUITNOW TRANSFER MR FRIEND", -500)).billId).toBeNull();
  });
  it("only bills paid from THIS account are candidates", () => {
    expect(one(row("NETFLIX.COM", -88.9), ctx({ accountId: SAVINGS, isSpendingAccount: false })).billId).toBeNull();
  });
  it("ignores paused bills", () => {
    const paused = bills.map((b) => (b.id === 2 ? { ...b, active: false } : b));
    expect(one(row("NETFLIX.COM", -88.9), ctx({ bills: paused })).billId).toBeNull();
  });
});

describe("4. known merchants", () => {
  it.each([
    ["PETRONAS DAGANGAN 5521", -60, "Transport & Fuel", "Petrol"],
    ["TNG EWALLET RELOAD", -50, "Transport & Fuel", "Touch 'n Go reload"],
    ["GRABFOOD 22", -31, "Eating Out", "Food delivery"],
    ["GRAB* RIDE", -14, "Transport & Fuel", "Ride-hailing"],
    ["99 SPEEDMART 1234", -23, "Groceries", "99 Speedmart"],
    ["STARBUCKS COFFEE", -14.5, "Eating Out", "Coffee / drinks"],
    ["SHOPEE MALAYSIA", -88, "Shopping", "Online / retail"],
    ["SALARY ACME SDN BHD", 5400, "Salary", "Salary"],
    ["INTEREST CREDIT", 3.2, "Investment Income", "Interest / dividend"],
    ["REFUND SHOPEE", 20, "Other Income", "Refund"],
  ])("%s -> %s", (description, rm, category, item) => {
    expect(one(row(description, rm))).toMatchObject({ categoryId: cat(category), item, source: "builtin", confidence: "high" });
  });

  it("an ATM withdrawal is a transfer into your cash account, NOT spending", () => {
    expect(one(row("ATM WITHDRAWAL KLCC", -300))).toMatchObject({ kind: "transfer", transferAccountId: CASH, source: "builtin" });
  });
  it("...and falls back to plain spending if you have no cash account", () => {
    const noCash = ctx({ accounts: [{ id: MAIN, type: "bank" }] });
    expect(one(row("ATM WITHDRAWAL KLCC", -300), noCash).kind).toBe("expense");
  });
  it("direction matters: a Shopee charge is spending, a Shopee credit is not", () => {
    expect(one(row("SHOPEE", -50)).kind).toBe("expense");
    expect(one(row("SHOPEE", 50)).source).toBe("default");
  });
});

describe("5. salary and 6. the rest", () => {
  it("a credit near take-home pay in the spending account is proposed as salary (low confidence)", () => {
    expect(one(row("IBG CREDIT ACME SDN BHD", 5300))).toMatchObject({ kind: "income", categoryId: cat("Salary"), source: "salary", confidence: "low" });
  });
  it("...but not in another account, nor far from the usual pay", () => {
    expect(one(row("IBG CREDIT", 5300), ctx({ isSpendingAccount: false })).source).toBe("default");
    expect(one(row("IBG CREDIT", 800)).source).toBe("default");
    expect(one(row("IBG CREDIT", 5300), ctx({ expectedIncome: 0 })).source).toBe("default");
  });
  it("anything unrecognised is plain spending/income, flagged low, with a tidy item name", () => {
    expect(one(row("DUITNOW QR MAKAN ENAK 99887766", -18))).toMatchObject({
      kind: "expense", categoryId: cat("Miscellaneous"), source: "default", confidence: "low", item: "Duitnow Qr Makan Enak",
    });
    expect(one(row("SOME PERSON", 40))).toMatchObject({ kind: "income", categoryId: cat("Other Income") });
  });
});

describe("helpers", () => {
  it("rulePattern drops reference numbers and bank noise, keeping the stable core", () => {
    expect(rulePattern("TRANSFER TO A/C 1234567890 MR TAN")).toBe("transfer to a c");
    expect(rulePattern("IBG CREDIT ACME SDN BHD 55555")).toBe("credit acme sdn bhd");
    expect(rulePattern("PETRONAS 1234")).toBe("petronas");
    // a description with almost nothing stable in it falls back to its first two words rather than an empty pattern
    expect(rulePattern("A 9")).toBe("a 9");
  });
  it("cleanItem makes a short readable name without reference numbers", () => {
    expect(cleanItem("DEBIT CARD PURCHASE PETRONAS 123456")).toBe("Debit Card Purchase Petronas");
    expect(cleanItem("x".repeat(80)).length).toBe(40);
    expect(cleanItem("1234567890")).toBe("Statement entry");
  });
  it("rowKeys tells identical same-day lines apart, so two real coffees both import", () => {
    const rows = [row("STARBUCKS", -14.5), row("STARBUCKS", -14.5), row("STARBUCKS", -14.5, "2026-09-11")];
    const keys = rowKeys(rows, MAIN);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toMatch(/\|0$/);
    expect(keys[1]).toMatch(/\|1$/);
  });
  it("the same statement always gets the same keys (so a re-import is detected)", () => {
    const rows = [row("A", -1), row("B", 2)];
    expect(rowKeys(rows, MAIN)).toEqual(rowKeys(rows, MAIN));
    expect(rowKeys(rows, MAIN)).not.toEqual(rowKeys(rows, SAVINGS));
  });
});
