import type { NextRequest } from "next/server";
import { parseTxSearch } from "@/lib/queries/filters";
import { getAccountLedger } from "@/lib/queries/ledger";
import { listAccounts } from "@/lib/queries/reference";
import { listTransactions } from "@/lib/queries/transactions";
import { csvCell, csvLine, exportPeriod } from "@/lib/csv";
import { STATEMENT_HEADER, statementRows } from "@/lib/statement";

// BOM so Excel opens UTF-8 (emoji-free here, but names may contain accents).
const csv = (lines: string[], filename: string) =>
  new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
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
    // Columns 1, 2 and 6 (description, category, note) are free text; the date and the money columns are not.
    return csv([csvLine(STATEMENT_HEADER), ...lines.map((l) => csvLine(l, [1, 2, 6]))], `statement-${slug}-${exportPeriod(view)}.csv`);
  }

  const rows = await listTransactions({ ...view.filters, limit: 100_000 });
  const lines = [
    ["Date", "Type", "Amount (RM)", "Category", "Item", "Account", "To account", "Note"].join(","),
    ...rows.map((r) =>
      [
        r.date,
        r.type,
        (r.amount / 100).toFixed(2),
        csvCell(r.categoryName, { text: true }),
        csvCell(r.item, { text: true }),
        csvCell(r.accountName, { text: true }),
        csvCell(r.toAccountName, { text: true }),
        csvCell(r.note, { text: true }),
      ].join(","),
    ),
  ];
  return csv(lines, `transactions-${exportPeriod(view)}.csv`);
}
