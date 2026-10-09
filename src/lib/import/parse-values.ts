import type { DateFormat } from "./types";

/**
 * Reading the values bank statements actually contain: "1,234.50-", "500.00 CR", "(45.00)", "RM 12.5",
 * "01/09/26", "1-Sep-2026", "01 September 2026".
 */

export type MoneyToken = {
  /** Always positive, in sen. */
  sen: number;
  /** -1 = marked as money out (-, (..), DR), +1 = marked as money in (+, CR), 0 = unmarked. */
  sign: -1 | 0 | 1;
};

export function parseMoneyToken(raw: string): MoneyToken | null {
  let s = raw.trim().replace(/^(?:rm|myr)\s*/i, "");
  if (!s) return null;
  let sign: -1 | 0 | 1 = 0;

  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1).trim();
  }
  const suffix = s.match(/\s*(cr|dr|\+|-)$/i);
  if (suffix) {
    sign = /^(dr|-)$/i.test(suffix[1]) ? -1 : 1;
    s = s.slice(0, suffix.index).trim();
  }
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    sign = 1;
    s = s.slice(1).trim();
  }
  s = s.replace(/^(?:rm|myr)\s*/i, "").replace(/,/g, "").replace(/\s/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return { sen: Number(whole) * 100 + Number(frac.padEnd(2, "0")), sign };
}

const CREDITISH = /\b(?:cr|credit|deposit|salary|gaji|interest|faedah|dividend|dividen|refund|cashback|reversal|received)\b/i;

/** When nothing on a line says which way money moved, bet on spending (most lines are) unless it reads like income. */
export function guessDirection(description: string): 1 | -1 {
  return CREDITISH.test(description) ? 1 : -1;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (n: number) => String(n).padStart(2, "0");
function daysInMonthOf(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > daysInMonthOf(y, m)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/**
 * Parse a statement date into YYYY-MM-DD. `format` says how numeric dates are ordered (Malaysia: day first).
 * A date with no year ("01/09") takes `yearHint`.
 */
export function parseStatementDate(raw: string, format: DateFormat = "dmy", yearHint?: number): string | null {
  const s = raw.trim().replace(/\s+/g, " ");

  // 01 Sep 2026 | 1-Sep-26 | 01/Sep/2026 | 1 September | Sep 1, 2026
  const named = s.match(/^(\d{1,2})[\s\-\/.]+([a-z]{3,9})[\s\-\/.,]*(\d{2,4})?$/i);
  if (named) {
    const m = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    const y = named[3] ? fullYear(Number(named[3])) : yearHint;
    return m && y ? iso(y, m, Number(named[1])) : null;
  }
  const namedFirst = s.match(/^([a-z]{3,9})[\s\-\/.]+(\d{1,2})(?:st|nd|rd|th)?[\s,\-\/.]*(\d{2,4})?$/i);
  if (namedFirst) {
    const m = MONTHS.indexOf(namedFirst[1].slice(0, 3).toLowerCase()) + 1;
    const y = namedFirst[3] ? fullYear(Number(namedFirst[3])) : yearHint;
    return m && y ? iso(y, m, Number(namedFirst[2])) : null;
  }

  // 2026-09-01 (year first, always unambiguous)
  const ymd = s.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?:[T ].*)?$/);
  if (ymd) return iso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  // 01/09/2026 | 01-09-26 | 01.09.2026 | 01/09
  const num = s.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/);
  if (num) {
    const [a, b] = [Number(num[1]), Number(num[2])];
    const y = num[3] ? fullYear(Number(num[3])) : yearHint;
    if (!y) return null;
    return format === "mdy" ? iso(y, a, b) : iso(y, b, a);
  }
  return null;
}

/** Decide day-first vs month-first from sample dates. Malaysia is day-first, so that is the default. */
export function detectDateFormat(samples: string[]): DateFormat {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const raw of samples) {
    const s = raw.trim();
    if (/^\d{4}[\/.\-]/.test(s)) return "ymd";
    const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-]/);
    if (!m) continue;
    if (Number(m[1]) > 12) dayFirst++;
    else if (Number(m[2]) > 12) monthFirst++;
  }
  return monthFirst > dayFirst ? "mdy" : "dmy";
}
