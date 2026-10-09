import { detectDateFormat, guessDirection, parseMoneyToken, parseStatementDate } from "./parse-values";
import { checkBalances, describeCheck } from "./reconcile";
import type { BalanceCheck, CsvLayout, DateFormat, StatementRow } from "./types";

/** RFC 4180 CSV: quoted fields, "" escapes, newlines inside quotes, any of , ; tab | as the separator. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const d = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === d) {
      row.push(field.trim());
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field.trim());
      field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

function detectDelimiter(src: string): string {
  const lines = src.split(/\r?\n/).filter((l) => l.trim()).slice(0, 8);
  let best = ",";
  let bestScore = 0;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const min = Math.min(...counts);
    if (min > bestScore) {
      best = d;
      bestScore = min;
    }
  }
  return best;
}

// Header words, English and Malay.
const HEAD = {
  date: /(^|\b)(date|tarikh)\b/i,
  dateWeak: /value|effective/i,
  desc: /desc|particular|detail|narrat|remark|butiran|keterangan|payee|merchant|reference|^ref\b|memo/i,
  debit: /debit|withdraw|\bdr\b|paid out|money out|keluar|^out$/i,
  credit: /credit|deposit|\bcr\b|paid in|money in|masuk|^in$/i,
  amount: /^(transaction )?amount\b|^amt\b|jumlah|^value$|^amount/i,
  balance: /balance|baki/i,
};

export function detectCsvLayout(rows: string[][]): CsvLayout | null {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cells = rows[r].map((c) => c.trim());
    const find = (re: RegExp, skip?: RegExp) => cells.findIndex((c) => c && re.test(c) && !(skip && skip.test(c)));

    let date = find(HEAD.date, HEAD.dateWeak);
    if (date < 0) date = find(HEAD.date);
    const debit = find(HEAD.debit);
    const credit = find(HEAD.credit);
    const amount = debit < 0 && credit < 0 ? find(HEAD.amount) : -1;
    const balance = find(HEAD.balance);
    const description = cells.map((c, i) => (c && HEAD.desc.test(c) && i !== date ? i : -1)).filter((i) => i >= 0);
    if (!description.length) {
      const generic = cells.findIndex((c, i) => i !== date && /transaction/i.test(c));
      if (generic >= 0) description.push(generic);
    }

    const hasMoney = debit >= 0 || credit >= 0 || amount >= 0;
    if (date >= 0 && hasMoney) {
      // Sample the cells under the date column to choose day-first or month-first.
      const samples = rows.slice(r + 1, r + 40).map((row) => row[date] ?? "");
      return {
        headerRow: r,
        date,
        description,
        debit: debit >= 0 ? debit : null,
        credit: credit >= 0 ? credit : null,
        amount: amount >= 0 ? amount : null,
        balance: balance >= 0 ? balance : null,
        dateFormat: detectDateFormat(samples),
      };
    }
  }
  return null;
}

export type CsvParseResult = {
  rows: StatementRow[];
  layout: CsvLayout;
  headers: string[];
  /** The first few raw rows after the header, for the "do the columns look right?" panel. */
  sample: string[][];
  skipped: number;
  openingBalance: number | null;
  check: BalanceCheck;
  warnings: string[];
};

export type CsvOverrides = Partial<Omit<CsvLayout, "headerRow">> & { headerRow?: number };

/** Read a bank CSV. Returns null when no usable header is found (the caller can ask for a manual column mapping). */
export function parseCsvStatement(text: string, overrides: CsvOverrides = {}): CsvParseResult | null {
  const raw = parseCsv(text);
  const detected = detectCsvLayout(raw);
  const blank: CsvLayout = { headerRow: 0, date: null, description: [], debit: null, credit: null, amount: null, balance: null, dateFormat: "dmy" };
  // Without a recognisable header, a manual column choice (overrides) is the only way in.
  const base = detected ?? (overrides.date != null ? blank : null);
  if (!base) return null;
  const layout: CsvLayout = { ...base };
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) (layout as Record<string, unknown>)[k] = v;
  if (layout.date === null) return null;

  const headers = raw[layout.headerRow] ?? [];
  const body = raw.slice(layout.headerRow + 1);
  const money = (cell: string | undefined) => (cell?.trim() ? parseMoneyToken(cell) : null);

  let skipped = 0;
  const parsed: Omit<StatementRow, "index">[] = [];
  for (const cells of body) {
    const date = parseStatementDate(cells[layout.date] ?? "", layout.dateFormat as DateFormat);
    if (!date) {
      skipped++;
      continue;
    }
    const description = layout.description
      .map((i) => cells[i] ?? "")
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    let amount: number | null = null;
    let signedBy: StatementRow["signedBy"] = "column";
    if (layout.debit !== null || layout.credit !== null) {
      const debit = money(cells[layout.debit ?? -1])?.sen ?? 0;
      const credit = money(cells[layout.credit ?? -1])?.sen ?? 0;
      if (debit || credit) amount = credit - debit;
    } else if (layout.amount !== null) {
      const t = money(cells[layout.amount]);
      if (t) {
        // Explicit marks are trusted; an unmarked amount is a guess until the running balance confirms it.
        amount = (t.sign === 0 ? guessDirection(description) : t.sign) * t.sen;
        signedBy = t.sign === 0 ? "guess" : "hint";
      }
    }
    if (amount === null || amount === 0) {
      skipped++;
      continue;
    }
    const bal = layout.balance !== null ? money(cells[layout.balance]) : null;
    parsed.push({ date, description, amount, balance: bal ? (bal.sign === -1 ? -bal.sen : bal.sen) : null, signedBy });
  }

  // Some banks list newest first. The balance chain only makes sense oldest first.
  const descending = parsed.length > 1 && parsed[0].date > parsed[parsed.length - 1].date;
  const ordered = (descending ? [...parsed].reverse() : parsed).map((r, index) => ({ ...r, index }));

  const { rows, check } = checkBalances(ordered, null);
  return {
    rows,
    layout,
    headers,
    sample: body.slice(0, 5),
    skipped,
    openingBalance: check.openingBalance,
    check,
    warnings: describeCheck(check),
  };
}
