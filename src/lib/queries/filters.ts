import { currentMonth, isISODate, isMonth, monthEnd, monthStart, shiftDays } from "@/lib/dates";
import { parseSen } from "@/lib/money";
import { TX_SORTS, type TxFilters, type TxSort } from "./transactions";

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export type TxView = {
  filters: TxFilters;
  /** 'YYYY-MM', or 'all' when browsing every month. */
  month: string;
  page: number;
  /** What was asked, echoed for forms and links. Amounts and the sort are only echoed when they were understood. */
  raw: { q: string; category: string; account: string; type: string; from: string; to: string; min: string; max: string; sort: string };
  /**
   * A date range asked for in the address (`from` / `to`), which beats the month. The Dashboard links here for a pay cycle
   * (26 Sep - 25 Oct is not a calendar month), and the Filter sheet writes one. Null when the page is browsing by month or
   * all time. A reversed pair is put the right way round rather than matching nothing.
   */
  range: { from: string | null; to: string | null } | null;
};

/**
 * Turn URL search params into query filters. Shared by the page and the CSV export.
 * With no `month` it defaults to the current one, i.e. it reads the clock: call `await connection()` first in a page.
 */
export function parseTxSearch(sp: SearchParams): TxView {
  const monthParam = first(sp.month);
  const month = monthParam === "all" ? "all" : isMonth(monthParam) ? monthParam : currentMonth();
  const q = first(sp.q) ?? "";
  const category = first(sp.category) ?? "";
  const account = first(sp.account) ?? "";
  const type = first(sp.type) ?? "";
  const page = Math.max(1, Number(first(sp.page)) || 1);

  const filters: TxFilters = {};
  if (month !== "all") {
    filters.from = monthStart(month);
    filters.to = monthEnd(month);
  }
  let from = isISODate(first(sp.from)) ? first(sp.from)! : null;
  let to = isISODate(first(sp.to)) ? first(sp.to)! : null;
  if (from && to && from > to) [from, to] = [to, from];
  if (from) filters.from = from;
  if (to) filters.to = to;

  // Amounts are typed in ringgit ("100", "12.50", "1,000"); one that can't be read (or is negative) is ignored, not guessed at.
  const minRaw = (first(sp.min) ?? "").trim();
  const maxRaw = (first(sp.max) ?? "").trim();
  let minAmount = minRaw ? parseSen(minRaw) : null;
  let maxAmount = maxRaw ? parseSen(maxRaw) : null;
  let [min, max] = [minAmount === null ? "" : minRaw, maxAmount === null ? "" : maxRaw];
  if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
    [minAmount, maxAmount] = [maxAmount, minAmount];
    [min, max] = [max, min];
  }
  if (minAmount !== null) filters.minAmount = minAmount;
  if (maxAmount !== null) filters.maxAmount = maxAmount;

  const sortParam = first(sp.sort);
  const sort = TX_SORTS.find((s) => s === sortParam) as TxSort | undefined;
  if (sort && sort !== "newest") filters.sort = sort;

  if (category) filters.categoryId = Number(category) || undefined;
  if (account) filters.accountId = Number(account) || undefined;
  if (type === "income" || type === "expense" || type === "transfer") filters.type = type;
  if (q.trim()) filters.q = q.trim();
  const range = from || to ? { from, to } : null;
  return {
    filters,
    month,
    page,
    raw: { q, category, account, type, from: from ?? "", to: to ?? "", min, max, sort: filters.sort ?? "" },
    range,
  };
}

/** Quick ranges for the Filter sheet, ending today (so they must be built at request time, with the clock in hand). */
export function datePresets(today: string): { label: string; from: string; to: string }[] {
  return [
    { label: "Last 7 days", from: shiftDays(today, -6), to: today },
    { label: "Last 30 days", from: shiftDays(today, -29), to: today },
    { label: "Last 90 days", from: shiftDays(today, -89), to: today },
    { label: "This year", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}

/** Rebuild a query string, dropping empty values. */
export function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}
