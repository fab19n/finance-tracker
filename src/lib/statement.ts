import { accountLedger, balanceAtEndOf, type LedgerEntry } from "@/lib/analytics/ledger";
import { shiftDays } from "@/lib/dates";
import { transferView } from "@/lib/transfer-view";

export const STATEMENT_HEADER = ["Date", "Description", "Category", "Money in (RM)", "Money out (RM)", "Balance (RM)", "Note"];

/** The part of a listed entry a statement line needs (a `TxRow` fits). */
export type StatementSource = {
  id: number;
  date: string;
  type: "income" | "expense" | "transfer";
  item: string | null;
  note: string | null;
  accountId: number;
  accountName: string;
  toAccountId: number | null;
  toAccountName: string | null;
  categoryName: string | null;
};

const rm = (sen: number) => (sen / 100).toFixed(2);

/**
 * One account's entries as a bank statement reads: oldest first, money in and money out in their own columns, and the
 * account's balance after each line. The balance is the real one (opening balance and every earlier entry), so filtering
 * the list by a search, a category or a type leaves gaps in the lines but never changes a balance on one.
 *
 * It opens with a line for where the balance stood: "Opening balance" when the statement starts at the beginning, or
 * "Balance brought forward" (the balance at the end of the day before `from`) when it starts later.
 *
 * `rows` are the entries to print (already filtered); `entries` are ALL of the account's, which the balance is built from.
 */
export function statementRows(p: {
  opening: number;
  entries: LedgerEntry[];
  accountId: number;
  rows: StatementSource[];
  from: string | null;
}): string[][] {
  const lines = accountLedger(p.opening, p.entries, p.accountId);
  const byId = new Map(lines.map((l) => [l.id, l]));
  const sorted = [...p.rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));

  const brought = p.from ? balanceAtEndOf(p.opening, lines, shiftDays(p.from, -1)) : p.opening;
  const out: string[][] = [[p.from ?? sorted[0]?.date ?? "", p.from ? "Balance brought forward" : "Opening balance", "", "", "", rm(brought), ""]];

  for (const r of sorted) {
    const line = byId.get(r.id);
    if (!line) continue; // not on this account: cannot be placed in its balance
    const isTransfer = r.type === "transfer";
    out.push([
      r.date,
      isTransfer ? transferView(r, p.accountId).title : r.item || r.categoryName || "Entry",
      isTransfer ? "" : (r.categoryName ?? ""),
      line.delta > 0 ? rm(line.delta) : "",
      line.delta < 0 ? rm(-line.delta) : "",
      rm(line.balance),
      r.note ?? "",
    ]);
  }
  return out;
}
