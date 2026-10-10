import { between, eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, categories, importRules, transactions } from "@/db/schema";
import { shiftDays } from "@/lib/dates";
import { selectBills } from "@/lib/queries/plan";
import type { PreviewOk, PreviewResult } from "./api-types";
import { classifyRows, type ExistingTx, type SavedRule } from "./classify";
import { countEntriesBefore } from "./commit";
import { parseCsvStatement, type CsvOverrides } from "./csv";
import { extractPdfLines, looksLikePdf, PdfError } from "./pdf-extract";
import { parseStatementText } from "./statement-text";
import type { BalanceCheck, StatementRow } from "./types";

export type PreviewInput = {
  accountId: number;
  bytes?: Uint8Array;
  text?: string;
  password?: string;
  overrides?: CsvOverrides;
  /** Take-home pay in sen, to spot a salary credit. */
  expectedIncome: number;
  /**
   * Leave out every line before this day (YYYY-MM-DD). Two banks' statements rarely start on the same day; starting
   * both accounts from one date keeps the transfers between them from being counted before the other side begins.
   */
  startDate?: string;
};

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Read a statement (PDF, CSV or pasted text) and turn it into rows with a proposal for each:
 * what it is, which category, whether it's already recorded. Nothing is written to the database.
 */
export async function buildPreview(db: DB, input: PreviewInput): Promise<PreviewResult> {
  const account = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
  if (!account) return { ok: false, error: "Choose which account this statement belongs to." };
  if (account.type === "investment") return { ok: false, error: "Statements can't be imported into an investment account." };

  let mode: "pdf" | "csv" | "text";
  let rows: StatementRow[] = [];
  let check: BalanceCheck | null = null;
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  let warnings: string[] = [];
  let skipped: string[] = [];
  let csv: PreviewResultCsv | undefined;

  if (input.bytes && input.bytes.length > MAX_BYTES) return { ok: false, error: "That file is too large (over 15 MB)." };

  try {
    if (input.bytes && looksLikePdf(input.bytes)) {
      mode = "pdf";
      const lines = await extractPdfLines(input.bytes, input.password);
      const parsed = parseStatementText(lines);
      rows = parsed.rows;
      check = parsed.check;
      openingBalance = parsed.openingBalance;
      closingBalance = parsed.closingBalance;
      warnings = parsed.warnings;
      skipped = parsed.skipped;
    } else {
      const text = input.text ?? (input.bytes ? new TextDecoder("utf-8").decode(input.bytes) : "");
      if (!text.trim()) return { ok: false, error: "There's nothing to read - choose a file or paste the statement text." };
      const asCsv = parseCsvStatement(text, input.overrides);
      if (asCsv && asCsv.rows.length) {
        mode = "csv";
        rows = asCsv.rows;
        check = asCsv.check;
        openingBalance = asCsv.openingBalance;
        warnings = asCsv.warnings;
        csv = { headers: asCsv.headers, sample: asCsv.sample, layout: asCsv.layout };
      } else {
        mode = "text";
        const parsed = parseStatementText(text.split(/\r?\n/));
        rows = parsed.rows;
        check = parsed.check;
        openingBalance = parsed.openingBalance;
        closingBalance = parsed.closingBalance;
        warnings = parsed.warnings;
        skipped = parsed.skipped;
        if (!rows.length && input.bytes) {
          // Looks like a table of values but with no header we recognise: let the user pick the columns.
          const sample = text.split(/\r?\n/).slice(0, 12).map((l) => l.split(/[,;\t|]/).map((c) => c.trim()));
          return { ok: false, error: "I couldn't find the columns. Choose which column holds the date, description and amount.", mapping: { sample } };
        }
      }
    }
  } catch (e) {
    if (e instanceof PdfError) {
      return {
        ok: false,
        error: e.message,
        needPassword: e.code === "password-required" || e.code === "password-wrong",
        passwordWrong: e.code === "password-wrong",
      };
    }
    return { ok: false, error: "Something went wrong reading that file." };
  }

  if (!rows.length) {
    return { ok: false, error: warnings[0] ?? "No transactions were found in that file." };
  }

  // Start from a chosen day. The starting balance becomes the bank's own balance just before the first line kept.
  // Lines keep their original positions, so their fingerprints equal those of a full import of the same file.
  let leftOut = 0;
  if (input.startDate) {
    const cut = rows.findIndex((r) => r.date >= input.startDate!);
    if (cut === -1) return { ok: false, error: `Every line in this statement is before ${input.startDate}, so there is nothing to import from it.` };
    if (cut > 0) {
      leftOut = cut;
      openingBalance = rows[cut - 1].balance;
      rows = rows.slice(cut);
    }
  }

  const first = rows[0].date;
  const last = rows[rows.length - 1].date;
  const lo = first < last ? first : last;
  const hi = first < last ? last : first;
  const existing: ExistingTx[] = db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      type: transactions.type,
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      importKey: transactions.importKey,
      note: transactions.note,
    })
    .from(transactions)
    .where(between(transactions.date, shiftDays(lo, -3), shiftDays(hi, 3)))
    .all();

  const rules: SavedRule[] = db.select().from(importRules).all();
  const classified = classifyRows(rows, {
    accountId: account.id,
    categories: db.select({ id: categories.id, name: categories.name, type: categories.type }).from(categories).where(eq(categories.archived, false)).all(),
    accounts: db.select({ id: accounts.id, type: accounts.type }).from(accounts).where(eq(accounts.archived, false)).all(),
    bills: selectBills(db),
    rules,
    existing,
    expectedIncome: input.expectedIncome,
    isSpendingAccount: account.purpose === "spending",
  });

  // Transfers that exist on only one side. A transfer shows up once on EACH account's statement, so one that doesn't is
  // money that went to (or came from) an account this app doesn't know about.
  const oneSided: PreviewOk["oneSided"] = [];
  const thisStatement = new Set(classified.map((r) => r.key));
  const matched = new Set(classified.map((r) => r.proposal.matchedId).filter((id): id is number => id !== undefined));
  for (const e of existing) {
    if (e.type !== "transfer" || e.importKey === null || e.date < lo || e.date > hi) continue;
    if (e.accountId !== account.id && e.toAccountId !== account.id) continue;
    if (thisStatement.has(e.importKey) || matched.has(e.id)) continue;
    oneSided.push({ date: e.date, amount: e.toAccountId === account.id ? e.amount : -e.amount, note: (e.note ?? "").replace(/\s+/g, " ").slice(0, 70), where: "other" });
  }
  const accountType = new Map(db.select({ id: accounts.id, type: accounts.type }).from(accounts).all().map((a) => [a.id, a.type]));
  // Only judge the other side if its own statement has been imported for these dates (else it is simply not here yet).
  const otherImported = (id: number) => existing.some((e) => e.date >= lo && e.date <= hi && e.accountId === id && e.type !== "transfer");
  for (const r of classified) {
    const p = r.proposal;
    if (p.kind !== "transfer" || p.source === "duplicate" || !p.transferAccountId || accountType.get(p.transferAccountId) === "cash") continue;
    if (otherImported(p.transferAccountId)) oneSided.push({ date: r.date, amount: r.amount, note: r.description.replace(/\s+/g, " ").slice(0, 70), where: "here" });
  }
  oneSided.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const duplicates = classified.filter((r) => r.proposal.source === "duplicate").length;
  const holds = classified.filter((r) => r.proposal.source === "hold").length;
  const entries = countEntriesBefore(db, account.id, lo);

  return {
    ok: true,
    mode,
    rows: classified,
    check: check!,
    openingBalance,
    closingBalance,
    warnings,
    skipped,
    dateRange: { from: lo, to: hi },
    leftOut,
    oneSided,
    stats: {
      total: classified.length,
      fresh: classified.length - duplicates - holds,
      duplicates,
      holds,
      needsReview: classified.filter((r) => r.proposal.kind !== "skip" && r.proposal.confidence === "low").length,
    },
    account: { id: account.id, name: account.name, existingEntries: entries, openingBalance: account.openingBalance },
    csv,
  };
}

type PreviewResultCsv = NonNullable<Extract<PreviewResult, { ok: true }>["csv"]>;
