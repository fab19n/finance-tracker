/**
 * Builds a minimal but real PDF in memory, with text at exact coordinates - enough to exercise the
 * actual PDF text extraction without shipping a (private) bank statement as a fixture.
 */
export type PdfWord = { text: string; x: number; y: number };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export function makePdf(pages: PdfWord[][]): Uint8Array {
  // Object numbers: 1 = catalog, 2 = page tree, then a (page, content) pair per page, then the font.
  const fontNo = 3 + pages.length * 2;
  const objects: string[] = [];
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((words, i) => {
    const stream = words.map((w) => `BT /F1 10 Tf 1 0 0 1 ${w.x} ${w.y} Tm (${esc(w.text)}) Tj ET`).join("\n");
    objects[2 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontNo} 0 R >> >> >>`;
    objects[3 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[fontNo - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

export type PrintoutRow = { head?: string[]; date: string; mid?: string; amount: string; balance: string; tail?: string[]; /** money IN (the amount sits under "Money In"); otherwise OUT */ in?: boolean };

/** Where the columns start. The amounts' "MYR" sits ~6 to the right of its heading, as on the real page. */
export const PRINTOUT_COLUMNS = { inX: 325, outX: 395, balanceX: 475 };

/**
 * A bank's web page printed to PDF (invented data). Each transaction runs over several lines with the DATE IN THE
 * MIDDLE: a head ("POS DEBIT", the merchant), the date line with the amounts, then a tail. The cents are separate,
 * spaced-out pieces of text ("MYR 25. 00"), rows are set apart by extra space, and the amount sits under "Money In" or
 * "Money Out" (the headings are printed on the first page only, as on the real thing).
 */
export function printoutPage(rows: PrintoutRow[], opts: { startY?: number; header?: boolean } = {}): PdfWord[] {
  const words: PdfWord[] = [];
  let y = opts.startY ?? 700;
  if (opts.header) {
    const c = PRINTOUT_COLUMNS;
    words.push({ text: "Date", x: 20, y: y + 40 }, { text: "Transaction Details", x: 150, y: y + 40 }, { text: "Money In", x: c.inX, y: y + 40 }, { text: "Money Out", x: c.outX, y: y + 40 }, { text: "Balance", x: c.balanceX, y: y + 40 });
  }
  const pieces = (v: string): [string, string] => {
    const [whole, cents] = v.split(".");
    return [`${whole}.`, cents];
  };
  for (const r of rows) {
    for (const h of r.head ?? []) {
      words.push({ text: h, x: 150, y });
      y -= 13.5;
    }
    words.push({ text: r.date, x: 20, y });
    if (r.mid) words.push({ text: r.mid, x: 150, y });
    const [aw, ac] = pieces(r.amount);
    const [bw, bc] = pieces(r.balance);
    const ax = (r.in ? PRINTOUT_COLUMNS.inX : PRINTOUT_COLUMNS.outX) + 6;
    const bx = PRINTOUT_COLUMNS.balanceX + 6;
    words.push({ text: "MYR", x: ax, y }, { text: aw, x: ax + 26, y }, { text: ac, x: ax + 52, y });
    words.push({ text: "MYR", x: bx, y }, { text: bw, x: bx + 26, y }, { text: bc, x: bx + 70, y });
    y -= 13.5;
    for (const t of r.tail ?? []) {
      words.push({ text: t, x: 150, y });
      y -= 13.5;
    }
    y -= 23.2; // padding between rows: 36.7 in all from one row's last line to the next row's first
  }
  return words;
}

/**
 * Newest first, as such pages list them. Amounts leave the account except the OLDEST, a friend paying their share:
 * money in, with nothing in its text that says so and no balance before it to prove it (the case that was once guessed
 * as a purchase and saved as a Netflix bill).
 */
export const PRINTOUT_ROWS: PrintoutRow[] = [
  { head: ["POS DEBIT", "20260301CAFE ABC KL"], date: "03 Mar 2026", mid: "T11111", amount: "25.00", balance: "975.00", tail: ["01/03/2026 5814", "CAFE ABC KL"] },
  { head: ["DUITNOW", "555111"], date: "02 Mar 2026", mid: "DuitNow QR", amount: "10.00", balance: "1,000.00", tail: ["DuitNow QR", "KEDAI SATU"] },
  { head: ["MYDEBIT PURCHASE", "SHOP XYZ IPOH"], date: "01 Mar 2026", mid: "1400EF000001", amount: "4.95", balance: "1,010.00", tail: ["SHOP XYZ", "IPOH"] },
  { head: ["DUITNOW TO MOBILE/ID", "396090796"], date: "28 Feb 2026", mid: "JANE A/L DOE", amount: "22.25", balance: "1,014.95", tail: ["Netflix jul"], in: true },
];

/** Two pages: the two newest rows (with the column headings), then the two oldest (without, as on the real thing). */
export const printoutPdf = (withHeader = true): Uint8Array =>
  makePdf([printoutPage(PRINTOUT_ROWS.slice(0, 2), { header: withHeader }), printoutPage(PRINTOUT_ROWS.slice(2))]);

/** Lay out statement rows as a table: one cell per column at fixed x positions, one line per row, top to bottom. */
export function tablePage(rows: string[][], columnX: number[], startY = 740, lineHeight = 14): PdfWord[] {
  const words: PdfWord[] = [];
  rows.forEach((cells, r) => {
    cells.forEach((text, c) => {
      if (text) words.push({ text, x: columnX[c], y: startY - r * lineHeight });
    });
  });
  return words;
}

// ---- a Touch 'n Go eWallet history (invented data) -------------------------------------------------------------------

export type TngColumn = { date: string; status?: string; type: string[]; desc: string[]; amount: string; balance: string };

/** The height of each row of the sideways table, from the bottom of the page up (as on the real PDF). */
const TNG_Y = { date: 20, status: 80, type: 140, ref: 230, desc: 295, details: 460, amount: 676, balance: 776 };

/** One transaction = one COLUMN: its fields stacked at fixed heights, long cells wrapped into pieces ~12 apart. */
export function tngColumn(x: number, c: TngColumn, n = 0): PdfWord[] {
  const four = /\.\d{4}$/.test(c.amount); // GO+ interest has four decimals and sits a little higher
  return [
    { text: c.date, x, y: TNG_Y.date },
    { text: c.status ?? "Success", x, y: TNG_Y.status },
    ...c.type.map((t, i) => ({ text: t, x: x + 12 * i, y: TNG_Y.type })),
    { text: `2026030${n}1311100`, x, y: TNG_Y.ref }, // a reference number: the reader ignores it
    ...c.desc.map((t, i) => ({ text: t, x: x + 12 * i, y: TNG_Y.desc })),
    { text: `2026030${n}1011000001000`, x, y: TNG_Y.details }, // so is this
    { text: c.amount, x, y: four ? TNG_Y.amount - 5 : TNG_Y.amount },
    { text: c.balance, x, y: TNG_Y.balance + (n % 2 ? 6 : 0) }, // the balance row is not perfectly level across cells
  ];
}

/** The row names at the left of a table (the first page of each table only). */
export function tngLabels(x: number, balanceLabel: string): PdfWord[] {
  return [
    { text: "Date", x, y: TNG_Y.date }, { text: "Status", x, y: TNG_Y.status }, { text: "Transaction Type", x, y: TNG_Y.type },
    { text: "Reference", x, y: TNG_Y.ref }, { text: "Description", x, y: TNG_Y.desc }, { text: "Details", x, y: TNG_Y.details },
    { text: "Amount (RM)", x, y: 658 }, { text: balanceLabel, x, y: 750 },
  ];
}

const VIA = "Quick Reload Payment (via GO+";
const GO_IN = ["Via eWallet to GO+"];
const EARN = ["GO+ Daily Earnings MMF2026030"];

/**
 * Invented numbers. The combined account starts at RM 5.02 (wallet 5.00 + GO+ 0.02) and ends at RM 15.03:
 *   5.02 + 30.00 from "JANE A/L DOE" - 10.00 card reload - 4.00 parking - 6.00 sent to "JOHN TAN" + 0.01 interest.
 * A RM 6.00 payment is reversed and cancelled (it nets to nothing); wallet <-> GO+ moves are internal.
 * Layout: page 1 = the wallet table (5 columns); page 2 = the rest of it on the left and the start of the GO+ table on the
 * right (under its "GO+ TRANSACTION" heading); page 3 = more of GO+, with no heading.
 */
export function tngPdf(opts: { goClosing?: string; extraWallet?: TngColumn[]; skipReversed?: boolean } = {}): Uint8Array {
  const wallet: TngColumn[] = [
    { date: "2/3/2026", type: ["DUITNOW_RECEI", "VEFROM"], desc: ["JANE A/L DOE"], amount: "RM30.00", balance: "RM35.00" },
    { date: "2/3/2026", type: ["eWallet Cash Out"], desc: GO_IN, amount: "RM35.00", balance: "RM0.00" },
    { date: "2/3/2026", type: ["Reload"], desc: [VIA, "Balance)"], amount: "RM10.00", balance: "RM10.00" },
    { date: "2/3/2026", type: ["Payment"], desc: ["Card Reload"], amount: "RM10.00", balance: "RM0.00" },
    { date: "5/3/2026", type: ["Reload"], desc: [VIA, "Balance)"], amount: "RM4.00", balance: "RM4.00" },
    { date: "5/3/2026", type: ["Payment"], desc: ["Parking"], amount: "RM4.00", balance: "RM0.00" },
    { date: "9/3/2026", type: ["Reload"], desc: [VIA, "Balance)"], amount: "RM6.00", balance: "RM6.00" },
    ...(opts.skipReversed ? [] : [{ date: "9/3/2026", status: "Reversed", type: ["Payment"], desc: ["Card Reload"], amount: "RM6.00", balance: "RM0.00" }]),
    { date: "9/3/2026", type: ["Payment Cancelled", "20260309211"], desc: ["Card Reload"], amount: "RM6.00", balance: "RM6.00" },
    { date: "9/3/2026", type: ["Transfer to Wallet"], desc: ["JOHN TAN"], amount: "RM6.00", balance: "RM0.00" },
    ...(opts.extraWallet ?? []),
  ];
  const go: TngColumn[] = [
    { date: "2/3/2026", type: ["GO+ Cash In"], desc: GO_IN, amount: "RM35.00", balance: "RM35.02" },
    { date: "3/3/2026", type: EARN, desc: ["Daily Interest"], amount: "RM0.0040", balance: "RM25.02" },
    { date: "6/3/2026", type: EARN, desc: ["Daily Interest"], amount: "RM0.0040", balance: "RM21.03" },
    { date: "10/3/2026", type: EARN, desc: ["Daily Interest"], amount: "RM0.0040", balance: opts.goClosing ?? "RM15.03" },
  ];
  const at = (xs: number[], cols: TngColumn[], from = 0) => cols.flatMap((c, i) => tngColumn(xs[i], c, from + i));
  const wx1 = [274, 320, 366, 412, 458];
  const rest = wallet.slice(5);
  const wx2 = [29, 75, 121, 167, 213, 259, 305].slice(0, Math.max(rest.length, 1));
  const page1: PdfWord[] = [
    { text: "TNG WALLET TRANSACTION HISTORY", x: 117, y: 292 },
    { text: "JANE A/L DOE", x: 144, y: 190 }, { text: "1 March 2026 - 10 March 2026", x: 215, y: 190 },
    { text: "TNG WALLET TRANSACTION", x: 241, y: 20 },
    ...tngLabels(259, "Wallet Balance"),
    ...at(wx1, wallet.slice(0, 5)),
    { text: "*This is a system generated email.", x: 555, y: 20 },
  ];
  const page2: PdfWord[] = [
    ...at(wx2, rest, 5),
    { text: "GO+ TRANSACTION", x: 311, y: 20 },
    ...tngLabels(329, "GO+ Balance"),
    ...at([344, 390, 436], go.slice(0, 3), 5),
    { text: "*This is a system generated email.", x: 555, y: 20 },
  ];
  const page3: PdfWord[] = [...at([29], go.slice(3), 9), { text: "*This is a system generated email.", x: 555, y: 20 }];
  return makePdf([page1, page2, page3]);
}
