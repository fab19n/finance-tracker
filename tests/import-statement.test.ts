import { describe, expect, it } from "vitest";
import { inferYear, parseStatementText } from "@/lib/import/statement-text";

const RM = (n: number) => Math.round(n * 100);
const lines = (s: string) => s.trim().split("\n");

// A Maybank-style savings statement: ONE signed amount (+/-) and the running balance. Descriptions wrap onto
// extra lines, and the page furniture repeats at the top of each page.
const MAYBANK = lines(`
MAYBANK ISLAMIC BERHAD
STATEMENT OF ACCOUNT
STATEMENT DATE : 30/09/26
ENTRY DATE TRANSACTION DESCRIPTION TRANSACTION AMOUNT STATEMENT BALANCE
BEGINNING BALANCE 1,200.00
28/08/26 SALARY ACME SDN BHD 5,400.00+ 6,600.00
28/08/26 TRANSFER TO A/C 4,200.00- 2,400.00
IBK FUND TFR TO SAVINGS
MR TAN
01/09/26 FPX PAYMENT RENT 965.00- 1,435.00
Page 1 of 2
ENTRY DATE TRANSACTION DESCRIPTION TRANSACTION AMOUNT STATEMENT BALANCE
05/09/26 PETRONAS DAGANGAN 62.50- 1,372.50
06/09/26 TRANSFER FROM A/C 500.00+ 1,872.50
ENDING BALANCE : 1,872.50
TOTAL DEBIT 5,227.50 TOTAL CREDIT 5,900.00
`);

// A CIMB-style statement: separate Withdrawal / Deposits / Tax columns, NO signs, only the balance shows direction.
const CIMB = lines(`
Date Description Ref No Withdrawal Deposits Tax Balance
01/09/2026 OPENING BALANCE 1,200.00
03/09/2026 DEBIT CARD PURCHASE PETRONAS 123456 62.50 0.00 1,137.50
05/09/2026 SALARY CREDIT ACME SDN BHD 998877 5,400.00 6,537.50
07/09/2026 DUITNOW TRANSFER 445566 4,200.00 2,337.50
MR TAN
09/09/2026 SERVICE CHARGE 0.50 0.00 2,337.00
`);

describe("a Maybank-style statement", () => {
  const r = parseStatementText(MAYBANK);

  it("reads every transaction with the right date, amount and direction", () => {
    expect(r.rows.map((x) => [x.date, x.amount])).toEqual([
      ["2026-08-28", RM(5400)],
      ["2026-08-28", -RM(4200)],
      ["2026-09-01", -RM(965)],
      ["2026-09-05", -RM(62.5)],
      ["2026-09-06", RM(500)],
    ]);
  });

  it("joins wrapped description lines and ignores page furniture and totals", () => {
    expect(r.rows[1].description).toBe("TRANSFER TO A/C IBK FUND TFR TO SAVINGS MR TAN");
    expect(r.rows[2].description).toBe("FPX PAYMENT RENT");
    expect(r.rows.some((x) => /page|total|ending/i.test(x.description))).toBe(false);
  });

  it("proves itself against the bank's running balance", () => {
    expect(r.openingBalance).toBe(RM(1200));
    expect(r.closingBalance).toBe(RM(1872.5));
    expect(r.check).toMatchObject({ checked: 5, matched: 5, mismatches: [], openingVerified: true });
    expect(r.rows.every((x) => x.signedBy === "balance")).toBe(true);
    expect(r.warnings).toEqual([]);
  });
});

describe("a Maybank row that straddles a page break (invented lines)", () => {
  const PAGED = lines(`
STATEMENT DATE : 30/09/26
BEGINNING BALANCE 1,000.00
01/09/26 SALE DEBIT 10.00- 990.00
SOME CAFE*
KUALA LUMPUR
02/09/26 IBK FUND TFR FR A/C 20.00- 970.00
Perhation / Note
(1) All items and balances shown will be considered correct unless the Bank is notified in writing.
Maybank Islamic Berhad
000002 IBS KAJANG MUKA/ PAGE : 2
ENTRY DATE TRANSACTION DESCRIPTION TRANSACTION AMOUNT STATEMENT BALANCE
NASI LEMAK STALL *
QR12345678
DUITNOW QR
03/09/26 SALARY CREDIT 500.00+ 1,470.00
ENDING BALANCE : 1,470.00
Perhation / Note
(1) All items and balances shown will be considered correct unless the Bank is notified in writing.
`);
  const r = parseStatementText(PAGED);

  it("keeps the payee lines from the next page and drops the footer", () => {
    expect(r.rows.map((x) => [x.date, x.amount])).toEqual([
      ["2026-09-01", -RM(10)],
      ["2026-09-02", -RM(20)],
      ["2026-09-03", RM(500)],
    ]);
    expect(r.rows[1].description).toContain("NASI LEMAK STALL");
    expect(r.rows.some((x) => /perhation|considered correct/i.test(x.description))).toBe(false);
  });
  it("still reads the balance chain and the closing balance", () => {
    expect(r.check).toMatchObject({ checked: 3, matched: 3, mismatches: [], openingVerified: true });
    expect(r.closingBalance).toBe(RM(1470));
  });
});

describe("a CIMB-style statement (no signs, Tax column)", () => {
  const r = parseStatementText(CIMB);

  it("works out money in vs out from the balance, and skips the Tax column", () => {
    expect(r.rows.map((x) => [x.date, x.amount])).toEqual([
      ["2026-09-03", -RM(62.5)],
      ["2026-09-05", RM(5400)],
      ["2026-09-07", -RM(4200)],
      ["2026-09-09", -RM(0.5)],
    ]);
  });
  it("keeps the reference-number and continuation text in the description", () => {
    expect(r.rows[2].description).toBe("DUITNOW TRANSFER 445566 MR TAN");
  });
  it("reconciles completely", () => {
    expect(r.check).toMatchObject({ checked: 4, matched: 4, mismatches: [], openingVerified: true });
  });
});

describe("safety checks", () => {
  it("flags a row that does not add up instead of silently importing it", () => {
    const tampered = MAYBANK.map((l) => l.replace("62.50- 1,372.50", "62.50- 1,300.00"));
    const r = parseStatementText(tampered);
    expect(r.check.mismatches.length).toBeGreaterThan(0);
    expect(r.check.openingVerified).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/don't add up/);
  });

  it("the balance overrides a wrong guess: an unmarked 'refund' that the balance shows going OUT is money out", () => {
    const r = parseStatementText(lines(`
BEGINNING BALANCE 500.00
02/09/26 REFUND SHOP 50.00 450.00
`));
    expect(r.rows[0]).toMatchObject({ amount: -RM(50), signedBy: "balance" });
  });

  it("gives up gracefully on a scanned or unreadable file", () => {
    const r = parseStatementText(["", "nothing useful here", "just some words"]);
    expect(r.rows).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/No transactions were found/);
  });
});

describe("layout variations", () => {
  it("handles a newest-first statement by putting it in date order before checking the balance chain", () => {
    const r = parseStatementText(lines(`
BEGINNING BALANCE 1,000.00
09/09/26 LAST 30.00- 970.00
05/09/26 MIDDLE 100.00- 1,000.00
01/09/26 FIRST 100.00+ 1,100.00
`));
    expect(r.rows.map((x) => x.description)).toEqual(["FIRST", "MIDDLE", "LAST"]);
    // Only correct reordering lets 1,000 -> 1,100 -> 1,000 -> 970 reconcile; any other order would not.
    expect(r.rows.map((x) => x.amount)).toEqual([10000, -10000, -3000]);
    expect(r.check).toMatchObject({ checked: 3, matched: 3, mismatches: [], openingVerified: true });
  });

  it("strips a second (value) date at the start of the line", () => {
    const r = parseStatementText(lines(`
BEGINNING BALANCE 100.00
01/09/26 02/09/26 COFFEE SHOP 10.00- 90.00
`));
    expect(r.rows[0]).toMatchObject({ date: "2026-09-01", description: "COFFEE SHOP", amount: -1000 });
  });

  it("reads dates written with month names", () => {
    const r = parseStatementText(lines(`
BEGINNING BALANCE 100.00
01 Sep 2026 COFFEE 10.00 90.00
12-Sep-26 BONUS 50.00 140.00
`));
    expect(r.rows.map((x) => [x.date, x.amount])).toEqual([["2026-09-01", -1000], ["2026-09-12", 5000]]);
  });

  it("gives year-less dates the statement's year, and rolls over December -> January", () => {
    const r = parseStatementText(lines(`
STATEMENT DATE 31/01/2027
BEGINNING BALANCE 100.00
28/12 ONE 10.00- 90.00
02/01 TWO 10.00- 80.00
`));
    expect(r.rows.map((x) => x.date)).toEqual(["2027-12-28", "2028-01-02"]);
  });

  it("copes with a statement that has no running balance (credit-card style), trusting CR/DR marks", () => {
    const r = parseStatementText(lines(`
03/09/26 GROCERIES 120.50
04/09/26 PAYMENT THANK YOU 200.00 CR
`));
    expect(r.rows.map((x) => x.amount)).toEqual([-RM(120.5), RM(200)]);
    expect(r.rows[0].signedBy).toBe("guess"); // no balance, no mark: assumed to be a charge
    expect(r.rows[1].signedBy).toBe("hint");
    expect(r.check.checked).toBe(0);
  });

  it("negative balances (an overdraft) are read as negative", () => {
    const r = parseStatementText(lines(`
BEGINNING BALANCE 10.00
02/09/26 BIG BILL 60.00 (50.00)
`));
    expect(r.rows[0]).toMatchObject({ amount: -6000, balance: -5000 });
  });
});

describe("inferYear", () => {
  it("takes the first full date near the top", () => {
    expect(inferYear(["Statement", "STATEMENT DATE: 30/09/26", "01/09 something"])).toBe(2026);
    expect(inferYear(["Date 15 Mar 2025"])).toBe(2025);
    expect(inferYear(["no dates here"])).toBeNull();
  });
});
