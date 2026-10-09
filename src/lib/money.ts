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

/** Parse user text like "12.5", "1,200", "RM 3.40" into integer sen. null if invalid. */
export function parseSen(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = input.replace(/rm/gi, "").replace(/[,\s]/g, "");
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"));
}

/** RM 1,234.50 */
export function formatRM(sen: number): string {
  return RM.format(sen / 100);
}

/** RM 1,235 (no decimals) - for charts and KPI tiles. */
export function formatRMWhole(sen: number): string {
  return RM_WHOLE.format(sen / 100);
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
