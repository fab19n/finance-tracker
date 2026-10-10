import { describe, expect, it } from "vitest";
import { extractPdfLines, extractPdfPages, looksLikePdf, PdfError } from "@/lib/import/pdf-extract";
import { amountColumns, blockDirection, splitRowBlocks, splitRowBlocksPositioned } from "@/lib/import/pdf-lines";
import { blocksHaveHeads, parseStatementText, rowBlocksToLines } from "@/lib/import/statement-text";
import { makePdf, PRINTOUT_COLUMNS, printoutPdf, tablePage } from "./pdf-fixture";

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

describe("a bank web page printed to PDF (several lines per transaction, the date in the middle)", () => {
  // Invented data in the shape of CIMB Clicks' Transaction History print-out: head / date + amounts / tail, newest first,
  // cents as separate pieces of text ("MYR 25. 00"), rows set apart by extra space.
  const pdf = printoutPdf();

  it("REGRESSION: reading line by line found no amounts at all, because of the spaced-out cents", async () => {
    const lines = await extractPdfLines(pdf);
    expect(lines.some((l) => /MYR 25\. 00 MYR 975\. 00/.test(l))).toBe(true); // that is really what the PDF yields
    expect(parseStatementText(lines).rows).toHaveLength(4); // and it is now read as 25.00 / 975.00
  });

  it("splits the page into one block per transaction (after the column headings), with text above the date line", async () => {
    const blocks = (await extractPdfPages(pdf)).flatMap((page) => splitRowBlocks(page));
    expect(blocks).toHaveLength(5);
    expect(blocks[0]).toEqual(["Date Transaction Details Money In Money Out Balance"]);
    expect(blocks[1]).toEqual(["POS DEBIT", "20260301CAFE ABC KL", "03 Mar 2026 T11111 MYR 25. 00 MYR 975. 00", "01/03/2026 5814", "CAFE ABC KL"]);
    expect(blocksHaveHeads(blocks)).toBe(true);
  });

  it("finds the Money In / Money Out headings (printed on the first page only) and each row's direction from its column", async () => {
    const pages = await extractPdfPages(pdf);
    const cols = amountColumns(pages);
    expect(cols).toEqual({ inX: PRINTOUT_COLUMNS.inX, outX: PRINTOUT_COLUMNS.outX });
    const blocks = pages.flatMap((page) => splitRowBlocksPositioned(page)).filter((b) => b.some((l) => /\d{4}/.test(l.text) && /MYR/.test(l.text)));
    // newest first: three purchases (under Money Out), then the friend's payment (under Money In)
    expect(blocks.map((b) => blockDirection(b, cols!))).toEqual([-1, -1, -1, 1]);
  });

  it("says nothing when the page has no Money In / Money Out headings, or the amount sits under neither", async () => {
    expect(amountColumns(await extractPdfPages(printoutPdf(false)))).toBeNull();
    const blocks = (await extractPdfPages(pdf)).flatMap((page) => splitRowBlocksPositioned(page));
    const row = blocks.find((b) => b.some((l) => /03 Mar/.test(l.text)))!;
    expect(blockDirection(row, { inX: 50, outX: 100 })).toBe(0); // the real columns are nowhere near these
  });

  it("an ordinary statement has no such headings", async () => {
    const maybankLike = makePdf([tablePage([["ENTRY DATE", "TRANSACTION DESCRIPTION", "TRANSACTION AMOUNT", "STATEMENT BALANCE"], ["28/08/26", "SALARY ACME", "5,400.00+", "6,600.00"]], COLS)]);
    expect(amountColumns(await extractPdfPages(maybankLike))).toBeNull();
  });

  it("an ordinary statement (the date first on each row) is not mistaken for one", async () => {
    const maybankLike = makePdf([tablePage([["28/08/26", "SALARY ACME", "5,400.00+", "6,600.00"], ["28/08/26", "TRANSFER", "4,200.00-", "2,400.00"]], COLS)]);
    expect(blocksHaveHeads((await extractPdfPages(maybankLike)).flatMap((page) => splitRowBlocks(page)))).toBe(false);
  });

  /** Read the way the importer does: by table row, with each amount's direction taken from its column. */
  const readByRow = async (bytes: Uint8Array) => {
    const pages = await extractPdfPages(bytes);
    const positioned = pages.flatMap((page) => splitRowBlocksPositioned(page));
    const cols = amountColumns(pages);
    return parseStatementText(rowBlocksToLines(positioned.map((b) => b.map((l) => l.text)), cols ? positioned.map((b) => blockDirection(b, cols)) : []));
  };

  it("REGRESSION: the oldest line, a friend paying in with nothing in its text to say so, is money IN (it was guessed as a purchase)", async () => {
    const r = await readByRow(pdf);
    expect(r.rows[0]).toMatchObject({ date: "2026-02-28", amount: RM(22.25), signedBy: "hint" });
    expect(r.rows[0].description).toMatch(/JANE A\/L DOE.*Netflix jul/);
    // ...and with no headings to read the columns from, it can only guess (and says so), as before
    const blind = await readByRow(printoutPdf(false));
    expect(blind.rows[0]).toMatchObject({ amount: -RM(22.25), signedBy: "guess" });
    expect(blind.check.firstRowGuessed).toBe(true);
  });

  it("rebuilds each transaction from its head, date line and tail, and reconciles with the running balance", async () => {
    const r = await readByRow(pdf);
    // oldest first, even though the page lists newest first
    expect(r.rows.map((x) => [x.date, x.amount])).toEqual([
      ["2026-02-28", RM(22.25)],
      ["2026-03-01", -RM(4.95)],
      ["2026-03-02", -RM(10)],
      ["2026-03-03", -RM(25)],
    ]);
    // each row has ITS OWN head and tail, not its neighbour's
    expect(r.rows[3].description).toMatch(/POS DEBIT.*CAFE ABC KL/);
    expect(r.rows[3].description).not.toMatch(/KEDAI SATU/);
    expect(r.rows[2].description).toMatch(/555111.*KEDAI SATU/);
    expect(r.rows[2].description).not.toMatch(/CAFE/);
    expect(r.check).toMatchObject({ checked: 3, matched: 3, mismatches: [] });
    expect(r.openingBalance).toBe(RM(992.7)); // 1,014.95 after the first line, which was +22.25
    expect(r.check.firstRowGuessed).toBe(false); // the page's columns settled the direction, so nothing is a guess
    expect(r.warnings).toEqual([]);
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
