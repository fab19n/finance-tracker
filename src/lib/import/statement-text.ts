import { guessDirection, parseMoneyToken, parseStatementDate, type MoneyToken } from "./parse-values";
import { checkBalances, describeCheck } from "./reconcile";
import type { BalanceCheck, DateFormat, ParsedStatement, StatementRow } from "./types";

/**
 * Read a bank statement from lines of text (extracted from a PDF, or pasted by hand).
 *
 * Layouts differ (Maybank prints one signed amount, CIMB prints separate Withdrawal / Deposits / Tax columns),
 * so this does not depend on columns. It relies on what every statement shares:
 *   - a transaction line starts with a date,
 *   - it ends with money amounts, the LAST of which is the running balance,
 *   - extra lines under it (no date) continue the description,
 *   - and the running balance proves which way each amount went (see reconcile.ts).
 */

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
const DATE_AT_START = new RegExp(
  `^\\s*(\\d{1,2}[\\/.\\-]\\d{1,2}(?:[\\/.\\-]\\d{2,4})?|\\d{1,2}[ \\-/]${MONTH}[ \\-/,]*(?:\\d{2,4})?)(?=\\s|$)`,
  "i",
);
const DATE_SHAPE = "(?:\\d{1,2}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{2,4}|\\d{1,2}[ \\-]\\w{3,9}[ \\-]\\d{2,4})";

// 1,234.56  500.00-  500.00 CR  (45.00)  - never a bare integer, so account numbers and dates are not money.
const MONEY = /\(?(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?!\d)\)?(?:\s?(?:CR|DR)\b|\s?[+-](?!\w))?/gi;

const OPENING = new RegExp(
  `^(?:${DATE_SHAPE}\\s+)?(?:beginning|opening|previous|prev\\.?|brought forward|b\\/?f\\b|balance (?:b\\/?f|brought|forward|from|at)|baki (?:awal|bawa))`,
  "i",
);
const CLOSING = /^(?:ending|closing|balance c\/?f|carried forward|c\/?f\b|baki (?:akhir|bawa)|total (?:debit|credit|withdrawal|deposit|amount)|jumlah|statement balance|end of statement|total)\b/i;
const NOISE = /^(?:page\s*\d+|\d+\s+of\s+\d+|halaman|mukasurat|statement\b|penyata|account\b|no\.? akaun|nombor akaun|continued|bersambung|\*{3,}|-{5,}|={5,}|please read|this is a computer|protected by|dilindungi|important notice|notis penting)/i;

/**
 * Maybank prints a legal footer ("Perhation / Note ...") and a fresh page header at every page break. A transaction
 * can straddle the break: its first line ends one page and its payee lines open the next, under the column header.
 */
const PAGE_FOOTER = /^(?:perhation|perhatian)\s*\/\s*note\b/i;

function isHeaderLine(text: string): boolean {
  const groups = [/descript|particular|details?\b|transaction/i, /withdraw|debit|deposit|credit|amount/i, /balance|baki/i, /\bdate\b|tarikh/i];
  return groups.filter((g) => g.test(text)).length >= 3 && !DATE_AT_START.test(text);
}

type Money = MoneyToken & { index: number; raw: string };

function moneyIn(text: string): Money[] {
  const out: Money[] = [];
  for (const m of text.matchAll(MONEY)) {
    const tok = parseMoneyToken(m[0]);
    if (tok) out.push({ ...tok, index: m.index ?? 0, raw: m[0] });
  }
  return out;
}

function stripMoney(text: string, money: Money[]): string {
  let out = text;
  for (const m of [...money].sort((a, b) => b.index - a.index)) out = out.slice(0, m.index) + " " + out.slice(m.index + m.raw.length);
  return out.replace(/\s+/g, " ").trim();
}

/** "MYR 25. 00" -> "MYR 25.00". Some web pages printed to PDF put the cents in a separate, spaced-out piece of text. */
const fixSplitDecimals = (s: string) => s.replace(/(\d)\.\s(\d{2})(?!\d)/g, "$1.$2");

/** The line of a row block that carries the date AND amounts (a card-swipe date on another line has no amount). */
const datedLineIndex = (block: string[]) => block.findIndex((l) => DATE_AT_START.test(fixSplitDecimals(l)) && moneyIn(fixSplitDecimals(l)).length > 0);

/**
 * Do the rows have text ABOVE their date line? That is the signature of a bank web page printed to PDF, where a
 * transaction reads "POS DEBIT / merchant / <date and amounts> / reference". Ordinary statements start each row
 * with its date, so this is false for them.
 */
export function blocksHaveHeads(blocks: string[][]): boolean {
  // The text above the date must be a payee/description. A statement's own furniture is not: in a month with a single
  // transaction, the column headings and "BEGINNING BALANCE" share a block with that one row and sit above its date.
  return blocks.some((b) => {
    const at = datedLineIndex(b);
    return at > 0 && !b.slice(0, at).some((l) => isHeaderLine(l) || OPENING.test(l));
  });
}

/**
 * Rebuild each table row (the lines of one transaction, found by the gap between rows) as the single line the
 * parser expects: "<date> <whole description> <amount> <balance>". The head lines above the date line and the
 * lines below it all belong to the same transaction.
 */
export function rowBlocksToLines(blocks: string[][], directions: (1 | -1 | 0)[] = []): string[] {
  const out: string[] = [];
  blocks.forEach((block, index) => {
    const clean = block.map((l) => fixSplitDecimals(l.trim()));
    const at = datedLineIndex(block);
    if (at < 0) return;
    const m = clean[at].match(DATE_AT_START)!;
    const all = [...clean.slice(0, at), clean[at].slice(m[0].length), ...clean.slice(at + 1)].join(" ");
    const money = moneyIn(all);
    const description = stripMoney(all, money).replace(/\b(?:MYR|RM)\b/gi, " ").replace(/\s+/g, " ").trim();
    // The page said which column the amount was in: say so with the sign the parser already understands ("25.00-" is
    // money out, "10.00+" is money in). Only the transaction amount is marked, never the balance after it.
    const way = directions[index] ?? 0;
    const tokens = money.map((x, i) => (i === 0 && money.length > 1 && way !== 0 && !/[+-]$/.test(x.raw) ? `${x.raw}${way === 1 ? "+" : "-"}` : x.raw));
    out.push(`${m[1]} ${description} ${tokens.join(" ")}`);
  });
  return out;
}

/** First full date with a year in the first lines, to give year-less dates ("01/09") a year. */
export function inferYear(lines: string[]): number | null {
  for (const line of lines.slice(0, 80)) {
    const m = line.match(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-](\d{4}|\d{2})\b/) ?? line.match(new RegExp(`\\b\\d{1,2}[ \\-]${MONTH}[ \\-,]+(\\d{4}|\\d{2})\\b`, "i"));
    if (m) {
      const y = Number(m[1]);
      return y < 100 ? 2000 + y : y;
    }
  }
  return null;
}

type Raw = { date: string; description: string; balance: number | null; candidates: Money[] };

const signed = (m: Money) => (m.sign === -1 ? -m.sen : m.sen);

export function parseStatementText(
  lines: string[],
  opts: { yearHint?: number; dateFormat?: DateFormat } = {},
): ParsedStatement & { check: BalanceCheck } {
  const format = opts.dateFormat ?? "dmy";
  let year = opts.yearHint ?? inferYear(lines) ?? new Date().getFullYear();
  let lastMonth = 0;

  let opening: number | null = null;
  let closing: number | null = null;
  const raws: Raw[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  let pending: { date: string; desc: string[]; money: Money[] } | null = null;

  const finalize = () => {
    const p = pending;
    pending = null;
    if (!p) return;
    if (!p.money.length) {
      skipped.push(`${p.date} ${p.desc.join(" ")}`.slice(0, 120));
      return;
    }
    const last = p.money[p.money.length - 1];
    const hasBalance = p.money.length >= 2;
    raws.push({
      date: p.date,
      description: p.desc.join(" ").replace(/\s+/g, " ").trim().slice(0, 200),
      balance: hasBalance ? signed(last) : null,
      candidates: hasBalance ? p.money.slice(0, -1) : p.money,
    });
  };

  let inPageBreak = false;
  for (const text of lines.map((l) => fixSplitDecimals(l.trim())).filter(Boolean)) {
    // Footer -> next page's header: drop it all, and do NOT end the transaction above, whose payee lines may follow.
    if (inPageBreak) {
      if (isHeaderLine(text)) inPageBreak = false;
      continue;
    }
    if (PAGE_FOOTER.test(text)) {
      inPageBreak = true;
      continue;
    }
    // Page furniture ends whatever transaction was being read.
    if (isHeaderLine(text) || NOISE.test(text)) {
      finalize();
      continue;
    }
    if (OPENING.test(text)) {
      finalize();
      const m = moneyIn(text);
      if (m.length && opening === null) opening = signed(m[m.length - 1]);
      continue;
    }
    if (CLOSING.test(text)) {
      finalize();
      const m = moneyIn(text);
      if (m.length && /^(?:ending|closing|balance c|carried|baki akhir|statement balance)/i.test(text)) closing = signed(m[m.length - 1]);
      continue;
    }

    const d = text.match(DATE_AT_START);
    if (d) {
      let rest = text.slice(d[0].length).trim();
      // Some banks print an entry date AND a value date.
      const second = rest.match(DATE_AT_START);
      const dateTok = d[1];
      if (second && parseStatementDate(second[1], format, year)) rest = rest.slice(second[0].length).trim();

      let iso = parseStatementDate(dateTok, format);
      const hadYear = iso !== null;
      if (!iso) iso = parseStatementDate(dateTok, format, year);
      if (iso) {
        // A year-less date that goes backwards by months has rolled into the next year (Dec -> Jan).
        if (!hadYear) {
          const month = Number(iso.slice(5, 7));
          if (lastMonth && month < lastMonth - 6) {
            year += 1;
            iso = parseStatementDate(dateTok, format, year);
          }
          lastMonth = month;
        }
        finalize();
        const money = moneyIn(rest);
        pending = { date: iso!, desc: [stripMoney(rest, money)], money };
        continue;
      }
    }

    // A line with no date under a transaction continues its description (beneficiary name, reference...).
    if (pending && pending.desc.length < 6) pending.desc.push(stripMoney(text, moneyIn(text)));
  }
  finalize();

  // Statements are oldest-first; some exports are newest-first, which the balance chain can't follow.
  const descending = raws.length > 1 && raws[0].date > raws[raws.length - 1].date;
  const ordered = descending ? [...raws].reverse() : raws;

  // Choose each row's real amount: the printed number that matches the change in running balance
  // (this also skips CIMB's "Tax" column), else the first non-zero number.
  const rows: StatementRow[] = [];
  let prev = opening;
  for (const r of ordered) {
    const nonZero = r.candidates.filter((c) => c.sen > 0);
    const delta = prev !== null && r.balance !== null ? r.balance - prev : null;
    const byBalance = delta !== null ? nonZero.find((c) => c.sen === Math.abs(delta)) : undefined;
    const pick = byBalance ?? nonZero[0];
    if (pick) {
      let amount: number;
      let signedBy: StatementRow["signedBy"];
      if (byBalance && delta !== null) {
        amount = delta;
        signedBy = "balance";
      } else if (pick.sign !== 0) {
        amount = pick.sign === -1 ? -pick.sen : pick.sen;
        signedBy = "hint";
      } else {
        amount = guessDirection(r.description) * pick.sen;
        signedBy = "guess";
      }
      rows.push({ index: rows.length, date: r.date, description: r.description, amount, balance: r.balance, signedBy });
    } else {
      skipped.push(`${r.date} ${r.description} (no amount)`.slice(0, 120));
    }
    if (r.balance !== null) prev = r.balance;
  }

  const { rows: checked, check } = checkBalances(rows, opening);
  if (!checked.length) warnings.push("No transactions were found. If this is a scanned image or an unusual layout, try pasting the statement text instead.");
  warnings.push(...describeCheck(check));
  return { rows: checked, openingBalance: check.openingBalance, closingBalance: closing, skipped: skipped.slice(0, 12), warnings, check };
}
