import type { NextRequest } from "next/server";
import { parseTxSearch } from "@/lib/queries/filters";
import { listTransactions } from "@/lib/queries/transactions";

const esc = (v: string | number | null) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV download of the current filter. Amounts are in RM with two decimals. */
export async function GET(request: NextRequest) {
  const view = parseTxSearch(Object.fromEntries(request.nextUrl.searchParams));
  const rows = await listTransactions({ ...view.filters, limit: 100_000 });
  const lines = [
    ["Date", "Type", "Amount (RM)", "Category", "Item", "Account", "To account", "Note"].join(","),
    ...rows.map((r) =>
      [
        r.date,
        r.type,
        (r.amount / 100).toFixed(2),
        esc(r.categoryName),
        esc(r.item),
        esc(r.accountName),
        esc(r.toAccountName),
        esc(r.note),
      ].join(","),
    ),
  ];
  // BOM so Excel opens UTF-8 (emoji-free here, but names may contain accents).
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="transactions-${view.month}.csv"`,
    },
  });
}
