/**
 * Money helpers. The database stores integer sen (1 RM = 100 sen).
 * This file is the ONLY place that converts between text/numbers and sen.
 */

const RM = new Intl.NumberFormat("en-MY", {
  style: "currency",
  currency: "MYR",
  currencyDisplay: "narrowSymbol",
});

const RM_WHOLE = new Intl.NumberFormat("en-MY", {
  style: "currency",
  currency: "MYR",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

/**
 * Take a typed amount apart into plain digits with a dot: "RM 1,200" -> "1200", "12,50" -> "12.50", "1.234,56" -> "1234.56".
 * A comma is a thousands separator, EXCEPT when it is the last separator and one or two digits follow it: that is a decimal
 * comma (the way many people type ringgit), and reading "12,50" as RM 1,250 would silently be a hundred times too much.
 * Three digits after a comma stay a thousands group ("1,200").
 */
function normaliseAmountText(input: string): string {
  const s = input.replace(/rm/gi, "").replace(/\s/g, "");
  const comma = s.lastIndexOf(",");
  if (comma > s.lastIndexOf(".") && /^\d{1,2}$/.test(s.slice(comma + 1))) {
    return `${s.slice(0, comma).replace(/[.,]/g, "")}.${s.slice(comma + 1)}`;
  }
  return s.replace(/,/g, "");
}

/** Parse user text like "12.5", "1,200", "12,50", "RM 3.40" into integer sen. null if invalid (including 3+ decimals). */
export function parseSen(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = normaliseAmountText(input);
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"));
}

/**
 * Why a typed amount can't be used, in words for the form: more than two decimals ("12.345") gets its own message instead of
 * the vague "greater than 0" (a figure with fractions of a sen is a typo, not something to round). Null = it reads fine
 * and is above zero.
 */
export function amountError(input: string | null | undefined): string | null {
  const sen = parseSen(input);
  if (sen !== null && sen > 0) return null;
  if (input != null && /^\d*\.\d{3,}$/.test(normaliseAmountText(input))) return "Use at most 2 decimals";
  return "Enter an amount greater than 0";
}

/** RM 1,234.50 */
export function formatRM(sen: number): string {
  return RM.format(sen / 100);
}

/** RM 1,235 (no decimals) - for charts and KPI tiles. */
export function formatRMWhole(sen: number): string {
  return RM_WHOLE.format(sen / 100);
}

/** 1,235 (whole ringgit, no "RM"): for tight spots like the phone budget rings. Intl puts a NO-BREAK space after the symbol, so strip any currency prefix and space, not a literal "RM ". */
export function formatRMWholeBare(sen: number): string {
  return formatRMWhole(sen).replace(/^[^\d-]+/, "");
}

/** Plain decimal string for form inputs: 1250 -> "12.50". */
export function senToInput(sen: number): string {
  return (sen / 100).toFixed(2);
}

/** Multiply sen by a ratio and round to a whole sen. */
export function scaleSen(sen: number, ratio: number): number {
  return Math.round(sen * ratio);
}

export function formatPct(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}
