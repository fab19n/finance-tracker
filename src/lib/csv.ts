/** CSV cells for the exports. Pure. */

/**
 * A text cell that starts with = + - @ (or a tab / carriage return) is run as a formula by Excel and Sheets. Bank statement
 * text is not under the owner's control, so such a cell gets a leading single quote, which spreadsheets show as plain text.
 * Only for TEXT cells: a money column keeps its real minus sign.
 */
export function neutraliseFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Quote a cell when it holds a comma, quote or line break. */
export function csvCell(v: string | number | null | undefined, opts: { text?: boolean } = {}): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (opts.text) s = neutraliseFormula(s);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One CSV line; `textColumns` are the indexes of cells that hold free text (the rest are dates and money). */
export function csvLine(cells: (string | number | null | undefined)[], textColumns: number[] = []): string {
  return cells.map((c, i) => csvCell(c, { text: textColumns.includes(i) })).join(",");
}

/** The file name part for what was exported: a date range when one was chosen, else the month. */
export function exportPeriod(view: { month: string; range?: { from?: string | null; to?: string | null } | null }): string {
  return view.range ? `${view.range.from ?? "start"}_to_${view.range.to ?? "now"}` : view.month;
}
