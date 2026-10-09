import { describe, expect, it } from "vitest";
import { extractPdfLines, looksLikePdf, PdfError } from "@/lib/import/pdf-extract";
import { parseStatementText } from "@/lib/import/statement-text";
import { makePdf, tablePage } from "./pdf-fixture";

const RM = (n: number) => Math.round(n * 100);
const COLS = [20, 90, 380, 470];

describe("PDF statements, end to end (real PDF bytes -> transactions)", () => {
  // Maybank-style: one signed amount column + balance, a wrapped description, and a second page with a repeated header.
  const maybank = makePdf([
    tablePage(
      [
        ["STATEMENT OF ACCOUNT", "", "", ""],
        ["ENTRY DATE", "TRANSACTION DESCRIPTION", "TRANSACTION AMOUNT", "STATEMENT BALANCE"],
        ["", "BEGINNING BALANCE", "", "1,200.00"],
        ["28/08/26", "SALARY ACME SDN BHD", "5,400.00+", "6,600.00"],
        ["28/08/26", "TRANSFER TO A/C", "4,200.00-", "2,400.00"],
        ["", "MR TAN", "", ""],
      ],
      COLS,
    ),
    tablePage(
      [
        ["ENTRY DATE", "TRANSACTION DESCRIPTION", "TRANSACTION AMOUNT", "STATEMENT BALANCE"],
        ["01/09/26", "FPX PAYMENT RENT", "965.00-", "1,435.00"],
        ["", "ENDING BALANCE", "", "1,435.00"],
      ],
      COLS,
    ),
  ]);

  it("recognises the file as a PDF", () => {
    expect(looksLikePdf(maybank)).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("Date,Description\n"))).toBe(false);
  });

  it("extracts lines in reading order, rebuilding each row from its separately-placed cells", async () => {
    const lines = await extractPdfLines(maybank);
    expect(lines).toContain("28/08/26 SALARY ACME SDN BHD 5,400.00+ 6,600.00");
    expect(lines).toContain("01/09/26 FPX PAYMENT RENT 965.00- 1,435.00");
    expect(lines.indexOf("STATEMENT OF ACCOUNT")).toBeLessThan(lines.indexOf("28/08/26 SALARY ACME SDN BHD 5,400.00+ 6,600.00"));
  });

  it("parses to the right transactions and reconciles with the bank's own balance", async () => {
    const r = parseStatementText(await extractPdfLines(maybank));
    expect(r.rows.map((x) => [x.date, x.amount])).toEqual([
      ["2026-08-28", RM(5400)],
      ["2026-08-28", -RM(4200)],
      ["2026-09-01", -RM(965)],
    ]);
    expect(r.rows[1].description).toBe("TRANSFER TO A/C MR TAN");
    expect(r.openingBalance).toBe(RM(1200));
    expect(r.closingBalance).toBe(RM(1435));
    expect(r.check).toMatchObject({ checked: 3, matched: 3, mismatches: [], openingVerified: true });
    expect(r.warnings).toEqual([]);
  });

  it("CIMB-style columns (Withdrawal / Deposits / Tax / Balance, unsigned): direction comes from the balance", async () => {
    const cimb = makePdf([
      tablePage(
        [
          ["Date", "Description", "Withdrawal", "Deposits", "Tax", "Balance"],
          ["01/09/2026", "OPENING BALANCE", "", "", "", "1,200.00"],
          ["03/09/2026", "DEBIT CARD PETRONAS", "62.50", "", "0.00", "1,137.50"],
          ["05/09/2026", "SALARY ACME", "", "5,400.00", "", "6,537.50"],
        ],
        [20, 90, 300, 360, 420, 480],
      ),
    ]);
    const r = parseStatementText(await extractPdfLines(cimb));
    expect(r.rows.map((x) => [x.date, x.amount])).toEqual([
      ["2026-09-03", -RM(62.5)],
      ["2026-09-05", RM(5400)],
    ]);
    expect(r.check).toMatchObject({ checked: 2, matched: 2, mismatches: [] });
  });

  it("is not fooled by the ORDER text appears in the file: position decides the reading order", async () => {
    // Words deliberately written balance-first, date-last.
    const shuffled = makePdf([
      [
        { text: "235.00", x: 470, y: 700 },
        { text: "965.00-", x: 380, y: 700 },
        { text: "RENT", x: 90, y: 700 },
        { text: "01/09/26", x: 20, y: 700 },
        { text: "1,200.00", x: 470, y: 720 },
        { text: "BEGINNING BALANCE", x: 90, y: 720 },
      ],
    ]);
    const r = parseStatementText(await extractPdfLines(shuffled));
    expect(r.rows).toMatchObject([{ date: "2026-09-01", description: "RENT", amount: -RM(965) }]);
    expect(r.check.openingVerified).toBe(true);
  });
});

describe("PDF problems are reported clearly", () => {
  it("garbage that isn't a PDF", async () => {
    await expect(extractPdfLines(new TextEncoder().encode("%PDF-1.4 this is not really a pdf"))).rejects.toMatchObject({ name: "PdfError", code: "unreadable" });
  });
  it("a PDF with no text on it (a scanned image)", async () => {
    await expect(extractPdfLines(makePdf([[]]))).rejects.toBeInstanceOf(PdfError);
    await expect(extractPdfLines(makePdf([[]]))).rejects.toMatchObject({ code: "no-text" });
  });
});
