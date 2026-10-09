import { describe, expect, it } from "vitest";
import { detectDateFormat, guessDirection, parseMoneyToken, parseStatementDate } from "@/lib/import/parse-values";
import { itemsToLines } from "@/lib/import/pdf-lines";
import { checkBalances } from "@/lib/import/reconcile";
import type { StatementRow } from "@/lib/import/types";

describe("parseMoneyToken", () => {
  it.each([
    ["1,234.50", { sen: 123450, sign: 0 }],
    ["500.00-", { sen: 50000, sign: -1 }], // Maybank style
    ["500.00 -", { sen: 50000, sign: -1 }],
    ["1,500.00+", { sen: 150000, sign: 1 }],
    ["45.00 CR", { sen: 4500, sign: 1 }],
    ["45.00 DR", { sen: 4500, sign: -1 }],
    ["(45.00)", { sen: 4500, sign: -1 }],
    ["-12.5", { sen: 1250, sign: -1 }],
    ["RM 12.50", { sen: 1250, sign: 0 }],
    ["rm1,000", { sen: 100000, sign: 0 }],
    ["MYR 150.00", { sen: 15000, sign: 0 }], // CIMB Clicks CSV
    ["myr1,000.50", { sen: 100050, sign: 0 }],
    ["0.00", { sen: 0, sign: 0 }],
    ["7", { sen: 700, sign: 0 }],
  ])("reads %j", (raw, expected) => {
    expect(parseMoneyToken(raw)).toEqual(expected);
  });
  it.each(["", "abc", "12.345", "1.2.3", "01/09/26", "--5.00"])("rejects %j", (raw) => {
    expect(parseMoneyToken(raw)).toBeNull();
  });
});

describe("parseStatementDate", () => {
  it.each([
    ["01/09/2026", "dmy", "2026-09-01"],
    ["01/09/26", "dmy", "2026-09-01"],
    ["1-9-26", "dmy", "2026-09-01"],
    ["01.09.2026", "dmy", "2026-09-01"],
    ["09/13/2026", "mdy", "2026-09-13"],
    ["2026-09-01", "dmy", "2026-09-01"],
    ["2026/09/01", "dmy", "2026-09-01"],
    ["01 Sep 2026", "dmy", "2026-09-01"],
    ["1-Sep-26", "dmy", "2026-09-01"],
    ["01/Sep/2026", "dmy", "2026-09-01"],
    ["1 September 2026", "dmy", "2026-09-01"],
    ["Sep 1, 2026", "dmy", "2026-09-01"],
    ["29/02/2028", "dmy", "2028-02-29"],
  ] as const)("%s (%s) -> %s", (raw, fmt, iso) => {
    expect(parseStatementDate(raw, fmt)).toBe(iso);
  });
  it("uses the year hint when the statement leaves the year out", () => {
    expect(parseStatementDate("01/09", "dmy", 2026)).toBe("2026-09-01");
    expect(parseStatementDate("01 Sep", "dmy", 2026)).toBe("2026-09-01");
    expect(parseStatementDate("01/09", "dmy")).toBeNull();
  });
  it.each(["31/02/2026", "32/01/2026", "00/01/2026", "29/02/2026", "13/13/2026", "hello", "12.50", ""])("rejects impossible or non-date %j", (raw) => {
    expect(parseStatementDate(raw, "dmy")).toBeNull();
  });
  it("detects day-first vs month-first from samples; Malaysia defaults to day-first", () => {
    expect(detectDateFormat(["25/09/2026", "01/10/2026"])).toBe("dmy");
    expect(detectDateFormat(["09/25/2026", "10/01/2026"])).toBe("mdy");
    expect(detectDateFormat(["01/02/2026", "03/04/2026"])).toBe("dmy"); // ambiguous -> day first
    expect(detectDateFormat(["2026-09-01"])).toBe("ymd");
  });
});

describe("itemsToLines", () => {
  it("rebuilds lines from positioned words: top to bottom, left to right", () => {
    const lines = itemsToLines([
      { str: "500.00-", x: 300, y: 700 },
      { str: "01/09/26", x: 20, y: 700 },
      { str: "PETRONAS", x: 100, y: 701 }, // a hair higher on the page, still the same line
      { str: "Header", x: 20, y: 760 },
      { str: "  ", x: 50, y: 700 }, // blank items are dropped
    ]);
    expect(lines).toEqual(["Header", "01/09/26 PETRONAS 500.00-"]);
  });
  it("treats clearly separate heights as separate lines", () => {
    expect(itemsToLines([{ str: "a", x: 0, y: 100 }, { str: "b", x: 0, y: 90 }])).toEqual(["a", "b"]);
  });
  it("glues fragments that touch (a number split across text items) but spaces words", () => {
    const lines = itemsToLines([
      { str: "1,234", x: 100, y: 50, width: 25 },
      { str: ".56", x: 125, y: 50, width: 14 }, // starts exactly where the previous ended
      { str: "CR", x: 160, y: 50, width: 10 },
    ]);
    expect(lines).toEqual(["1,234.56 CR"]);
  });
});

describe("checkBalances", () => {
  const row = (index: number, amount: number, balance: number | null, signedBy: StatementRow["signedBy"] = "guess"): StatementRow => ({
    index, date: "2026-09-01", description: "x", amount, balance, signedBy,
  });

  it("confirms rows that follow the running balance", () => {
    const { check } = checkBalances([row(0, -5000, 95000), row(1, 20000, 115000)], 100000);
    expect(check).toMatchObject({ checked: 2, matched: 2, mismatches: [], openingBalance: 100000, openingVerified: true });
  });
  it("fixes a guessed sign using the direction the balance moved", () => {
    const { rows, check } = checkBalances([row(0, 5000, 95000, "guess")], 100000);
    expect(rows[0]).toMatchObject({ amount: -5000, signedBy: "balance" });
    expect(check.mismatches).toEqual([]);
  });
  it("reports a row whose amount doesn't explain the balance change", () => {
    const { check } = checkBalances([row(0, -5000, 95000), row(1, -1000, 90000)], 100000);
    expect(check.mismatches).toEqual([1]);
    expect(check.openingVerified).toBe(false);
  });
  it("with no stated opening balance, suggests one from the first row but does NOT call it verified", () => {
    const { check } = checkBalances([row(0, -5000, 95000, "hint"), row(1, 20000, 115000)], null);
    expect(check.openingBalance).toBe(100000);
    expect(check.openingVerified).toBe(false);
    expect(check.checked).toBe(1); // the second row is checked against the first
  });
  it("rows without a printed balance are passed through untouched", () => {
    const { rows, check } = checkBalances([row(0, -500, null, "hint")], null);
    expect(rows[0].amount).toBe(-500);
    expect(check.checked).toBe(0);
    expect(check.openingBalance).toBeNull();
  });
});

describe("guessDirection", () => {
  it("bets on spending unless the line reads like income", () => {
    expect(guessDirection("PETRONAS DAGANGAN")).toBe(-1);
    expect(guessDirection("SALARY ACME SDN BHD")).toBe(1);
    expect(guessDirection("INTEREST CREDIT")).toBe(1);
    expect(guessDirection("REFUND SHOPEE")).toBe(1);
    expect(guessDirection("50.00 CR")).toBe(1);
  });
  it("REGRESSION: matches whole words only - 'cr' inside another word is not a credit", () => {
    // The word-boundary markers in the regex once turned into invisible backspace characters; these would then misfire.
    for (const spending of ["SCRIPT STORE", "MCDONALD CRAVINGS", "ACRYLIC SUPPLIES", "DEPOSITORY FEE?", "SALARYMAN CAFE"]) {
      expect(guessDirection(spending)).toBe(-1);
    }
  });
});
