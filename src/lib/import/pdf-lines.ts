/** A piece of text positioned on a PDF page (what a PDF text extractor returns). */
export type TextItem = { str: string; x: number; y: number; width?: number };

/**
 * Rebuild readable lines from positioned text. PDFs store words individually with coordinates, not as lines:
 * items sharing (roughly) the same height form a line, read left to right; lines read top to bottom.
 */
export function itemsToLines(items: TextItem[], yTolerance = 3): string[] {
  return itemsToPositionedLines(items, yTolerance).map((l) => l.text);
}

/** A line of text, the height it sits at on its page (higher y = higher on the page), and where each piece of it starts. */
export type PositionedLine = { text: string; y: number; items: { str: string; x: number }[] };

/**
 * Group a page's lines into table rows by the vertical gap between them. In a bank's web page printed to PDF, the lines
 * of one transaction sit close together and rows are separated by visibly more space (about 2.7x here). A page whose
 * lines are all evenly spaced yields a single block, which callers treat as "no row structure to use".
 */
export function splitRowBlocksPositioned(lines: PositionedLine[], factor = 1.8): PositionedLine[][] {
  if (!lines.length) return [];
  const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y).filter((g) => g > 0);
  const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
  const blocks: PositionedLine[][] = [[lines[0]]];
  for (let i = 1; i < lines.length; i++) {
    if (median > 0 && lines[i - 1].y - lines[i].y > median * factor) blocks.push([lines[i]]);
    else blocks[blocks.length - 1].push(lines[i]);
  }
  return blocks;
}

/** The same blocks as plain text lines. */
export function splitRowBlocks(lines: PositionedLine[], factor = 1.8): string[][] {
  return splitRowBlocksPositioned(lines, factor).map((block) => block.map((l) => l.text));
}

// ---- which column an amount sits in -------------------------------------------------------------------------------

/** Where the "money in" and "money out" columns start on the page (the left edge of their headings). */
export type AmountColumns = { inX: number; outX: number };

const IN_HEADING = /^(?:money in|credits?|deposits?|kredit)$/i;
const OUT_HEADING = /^(?:money out|debits?|withdrawals?|debit)$/i;

/**
 * Find the table's "Money In" / "Money Out" headings. They are printed once, on the first page, but the columns are
 * the same on every page, so one pair serves the whole document. Null when there is no such pair of headings.
 */
export function amountColumns(pages: PositionedLine[][]): AmountColumns | null {
  for (const page of pages) {
    for (const line of page) {
      const inItem = line.items.find((i) => IN_HEADING.test(i.str.trim()));
      const outItem = line.items.find((i) => OUT_HEADING.test(i.str.trim()));
      if (inItem && outItem && inItem.x !== outItem.x) return { inX: inItem.x, outX: outItem.x };
    }
  }
  return null;
}

/** The start of an amount: a currency marker ("MYR", "RM") or a number with its decimal point ("25."). */
const AMOUNT_START = /^(?:(?:MYR|RM)(?:\s|$)|\d[\d,]*\.\d{0,2}$)/i;

/**
 * Was the transaction in this row money IN (1), money OUT (-1), or can't it be told (0)? Read from where the amount
 * sits: under the "Money In" heading or under "Money Out". Needs the row's date line (the one with the amounts), whose
 * first amount is the transaction and whose last is the running balance.
 */
export function blockDirection(block: PositionedLine[], cols: AmountColumns): 1 | -1 | 0 {
  // Amounts start to the right of the description, so a number inside a description is never mistaken for one.
  const floor = Math.min(cols.inX, cols.outX) - 30;
  for (const line of block) {
    const starts = line.items.filter((i) => i.x >= floor && AMOUNT_START.test(i.str.trim()));
    // Two pieces that look like amounts on one line = a transaction amount and a balance; one alone is not enough to say.
    if (starts.length < 2) continue;
    const x = starts[0].x;
    const toIn = Math.abs(x - cols.inX);
    const toOut = Math.abs(x - cols.outX);
    const half = Math.abs(cols.inX - cols.outX) / 2;
    if (Math.min(toIn, toOut) > half) return 0; // nearer to neither column: not what we think it is
    return toIn < toOut ? 1 : -1;
  }
  return 0;
}

export function itemsToPositionedLines(items: TextItem[], yTolerance = 3): PositionedLine[] {
  const live = items.filter((i) => i.str.trim() !== "");
  // PDF y grows upward, so higher y = higher on the page.
  const sorted = [...live].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - item.y) <= yTolerance) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line): PositionedLine => {
    const ordered = [...line].sort((a, b) => a.x - b.x);
    let text = "";
    for (let i = 0; i < ordered.length; i++) {
      const cur = ordered[i];
      if (i > 0) {
        const prev = ordered[i - 1];
        const prevEnd = prev.x + (prev.width ?? prev.str.length * 4);
        // Glue fragments that touch (a number split across items); separate words with a space.
        text += cur.x - prevEnd > 1.5 || prev.width === undefined ? " " : "";
      }
      text += cur.str.trim();
    }
    return { text: text.replace(/\s+/g, " ").trim(), y: line[0].y, items: ordered.map((i) => ({ str: i.str.trim(), x: i.x })) };
  });
}
