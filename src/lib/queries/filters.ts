import { currentMonth, isISODate, isMonth, monthEnd, monthStart } from "@/lib/dates";
import type { TxFilters } from "./transactions";

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export type TxView = {
  filters: TxFilters;
  /** 'YYYY-MM', or 'all' when browsing every month. */
  month: string;
  page: number;
  raw: { q: string; category: string; account: string; type: string };
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
  const from = first(sp.from);
  const to = first(sp.to);
  if (isISODate(from)) filters.from = from;
  if (isISODate(to)) filters.to = to;
  if (category) filters.categoryId = Number(category) || undefined;
  if (account) filters.accountId = Number(account) || undefined;
  if (type === "income" || type === "expense" || type === "transfer") filters.type = type;
  if (q.trim()) filters.q = q.trim();
  return { filters, month, page, raw: { q, category, account, type } };
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
