import { describe, expect, it } from "vitest";
import { detectCsvLayout, parseCsv, parseCsvStatement } from "@/lib/import/csv";

const RM = (n: number) => Math.round(n * 100);

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and newlines inside fields, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n1,2,3');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "line1\nline2"],
      ["1", "2", "3"],
    ]);
  });
  it.each([[";"], ["\t"], ["|"]])("detects the %j separator", (d) => {
    expect(parseCsv(["a", "b", "c"].join(d) + "\n" + ["1", "2", "3"].join(d))).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });
  it("drops blank lines", () => {
    expect(parseCsv("a,b\n\n,\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseCsvStatement - separate Withdrawal / Deposit columns", () => {
  const csv = [
    "Account Statement,,,,",
    "Account: 1234,,,,",
    "Transaction Date,Description,Withdrawal,Deposit,Balance",
    "Opening Balance,,,,1200.00",
    "03/09/2026,PETRONAS DAGANGAN,62.50,,1137.50",
    "05/09/2026,\"SALARY, ACME SDN BHD\",,5400.00,6537.50",
    "07/09/2026,TRANSFER TO SAVINGS,4200.00,,2337.50",
    "Total,,4262.50,5400.00,",
  ].join("\n");
  const r = parseCsvStatement(csv)!;

  it("finds the header below the preamble and reads the columns", () => {
    expect(r.layout).toMatchObject({ headerRow: 2, date: 0, description: [1], debit: 2, credit: 3, balance: 4, dateFormat: "dmy" });
  });
  it("reads each row, skipping the opening-balance and total lines", () => {
    expect(r.rows.map((x) => [x.date, x.description, x.amount])).toEqual([
      ["2026-09-03", "PETRONAS DAGANGAN", -RM(62.5)],
      ["2026-09-05", "SALARY, ACME SDN BHD", RM(5400)],
      ["2026-09-07", "TRANSFER TO SAVINGS", -RM(4200)],
    ]);
    expect(r.skipped).toBe(2);
  });
  it("the balance chain holds from the first row's own balance", () => {
    expect(r.check).toMatchObject({ checked: 2, matched: 2, mismatches: [] });
    expect(r.openingBalance).toBe(RM(1200)); // inferred: 1,137.50 + 62.50
  });
});

describe("parseCsvStatement - one signed Amount column", () => {
  it("trusts explicit +/- and parentheses", () => {
    const r = parseCsvStatement(["Date,Details,Amount,Balance", "01-09-2026,COFFEE,-10.00,90.00", "02-09-2026,BONUS,+50.00,140.00", "03-09-2026,FEE,(1.00),139.00"].join("\n"))!;
    expect(r.rows.map((x) => x.amount)).toEqual([-1000, 5000, -100]);
    expect(r.check.mismatches).toEqual([]);
  });
  it("Maybank-style trailing signs", () => {
    const r = parseCsvStatement(["Date,Description,Amount,Balance", "01/09/26,COFFEE,10.00-,90.00", "02/09/26,BONUS,50.00+,140.00"].join("\n"))!;
    expect(r.rows.map((x) => x.amount)).toEqual([-1000, 5000]);
  });
  it("an UNMARKED amount is corrected by the balance when one is printed", () => {
    const r = parseCsvStatement(["Date,Description,Amount,Balance", "01/09/26,COFFEE,10.00,90.00", "02/09/26,TEA,5.00,85.00"].join("\n"))!;
    expect(r.rows.map((x) => x.amount)).toEqual([-1000, -500]);
    expect(r.rows[1].signedBy).toBe("balance");
  });
});

describe("parseCsvStatement - CIMB Clicks transaction-history layout (invented rows)", () => {
  // Newest first, every field quoted, "MYR " in front of amounts, 01-Sep-2026 dates, Money In / Money Out columns.
  const csv = [
    "Date,Transaction Details,Money In,Money Out,Balance",
    '"09-Oct-2026","DUITNOW TO ACCOUNT||111|SOMEONE ELSE|Topup||","MYR 150.00","","MYR 700.00"',
    '"08-Oct-2026","DUITNOW||222|NASI KANDAR|DuitNow QR|CASAOffUs|","","MYR 10.50","MYR 550.00"',
    '"07-Oct-2026","POS DEBIT|20261005Streaming Co|T1|05/10/2026 5815|Streaming Co|","","MYR 1,200.00","MYR 560.50"',
    '"01-Oct-2026","IBG CREDIT|PAYROLL|333||ACME SDN BHD|SEPT 2026","MYR 1,760.50","","MYR 1,760.50"',
  ].join("\n");
  const r = parseCsvStatement(csv)!;

  it("reads the columns, the MYR amounts and the day-Mon-year dates", () => {
    expect(r.layout).toMatchObject({ debit: 3, credit: 2, balance: 4 });
    expect(r.rows.map((x) => [x.date, x.amount])).toEqual([
      ["2026-10-01", RM(1760.5)],
      ["2026-10-07", -RM(1200)],
      ["2026-10-08", -RM(10.5)],
      ["2026-10-09", RM(150)],
    ]);
  });
  it("puts it in date order and the balance chain holds", () => {
    expect(r.check).toMatchObject({ checked: 3, matched: 3, mismatches: [] });
  });
});

describe("parseCsvStatement - orientation, formats and failures", () => {
  it("puts a newest-first export into date order before checking the chain", () => {
    const r = parseCsvStatement(["Date,Description,Debit,Credit,Balance", "09/09/26,C,30.00,,970.00", "05/09/26,B,100.00,,1000.00", "01/09/26,A,,100.00,1100.00"].join("\n"))!;
    expect(r.rows.map((x) => x.description)).toEqual(["A", "B", "C"]);
    expect(r.check).toMatchObject({ checked: 2, matched: 2, mismatches: [] });
  });
  it("detects month-first dates from the data", () => {
    const r = parseCsvStatement(["Date,Description,Debit,Credit", "09/25/2026,A,10.00,", "10/01/2026,B,,5.00"].join("\n"))!;
    expect(r.layout.dateFormat).toBe("mdy");
    expect(r.rows.map((x) => x.date)).toEqual(["2026-09-25", "2026-10-01"]);
  });
  it("prefers the transaction date over a value/effective date column", () => {
    const layout = detectCsvLayout(parseCsv("Value Date,Transaction Date,Description,Debit,Credit\n01/09/26,02/09/26,X,1.00,"))!;
    expect(layout.date).toBe(1);
  });
  it("joins several description columns", () => {
    const r = parseCsvStatement(["Date,Description,Reference,Debit", "01/09/26,PETRONAS,REF123,10.00"].join("\n"))!;
    expect(r.rows[0].description).toBe("PETRONAS REF123");
  });
  it("accepts a manual column mapping when there is no readable header", () => {
    const csv = "01/09/26,COFFEE,10.00\n02/09/26,TEA,5.00";
    expect(parseCsvStatement(csv)).toBeNull();
    const r = parseCsvStatement(csv, { headerRow: -1, date: 0, description: [1], amount: 2 })!;
    expect(r.rows.map((x) => x.description)).toEqual(["COFFEE", "TEA"]);
  });
  it("returns null for something that isn't a statement", () => {
    expect(parseCsvStatement("just,some,words\nand,more,words")).toBeNull();
  });
  it("skips zero-amount and undated rows, counting them", () => {
    const r = parseCsvStatement(["Date,Description,Debit,Credit", "01/09/26,A,0.00,", ",NO DATE,1.00,", "02/09/26,OK,1.00,"].join("\n"))!;
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(2);
  });
});
