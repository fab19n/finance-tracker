import type { NextRequest } from "next/server";
import { parseTxSearch } from "@/lib/queries/filters";
import { getAccountLedger } from "@/lib/queries/ledger";
import { listAccounts } from "@/lib/queries/reference";
import { listTransactions } from "@/lib/queries/transactions";
import { STATEMENT_HEADER, statementRows } from "@/lib/statement";

const esc = (v: string | number | null) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// BOM so Excel opens UTF-8 (emoji-free here, but names may contain accents).
const csv = (lines: string[], filename: string) =>
  new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });

/**
 * CSV download of the current filter. Amounts are in RM with two decimals.
 * With `format=statement` and one account chosen it is that account's statement instead: oldest first, money in and out in
 * their own columns, and the balance after each line.
 */
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const view = parseTxSearch(params);

  if (params.format === "statement") {
    const accountId = view.filters.accountId;
    if (!accountId) return new Response("A statement is for one account: choose an account first.", { status: 400 });
    const [rows, ledger, accounts] = await Promise.all([
      listTransactions({ ...view.filters, limit: 100_000 }),
      getAccountLedger(accountId),
      listAccounts(true),
    ]);
    const name = accounts.find((a) => a.id === accountId)?.name ?? "account";
    const lines = statementRows({ opening: ledger.opening, entries: ledger.entries, accountId, rows, from: view.filters.from ?? null });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "account";
    const period = view.range ? `${view.range.from ?? "start"}_to_${view.range.to ?? "now"}` : view.month;
    return csv([STATEMENT_HEADER, ...lines].map((l) => l.map(esc).join(",")), `statement-${slug}-${period}.csv`);
  }

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
  return csv(lines, `transactions-${view.month}.csv`);
}
