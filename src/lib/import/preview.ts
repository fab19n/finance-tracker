import { between, eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, categories, importRules, transactions } from "@/db/schema";
import { shiftDays } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { selectBills } from "@/lib/queries/plan";
import { selectShares } from "@/lib/queries/shares";
import type { PreviewOk, PreviewResult } from "./api-types";
import { classifyRows, type ExistingTx, type SavedRule } from "./classify";
import { booksBalanceBefore } from "./books";
import { countEntriesBefore } from "./commit";
import { learnFromHistory } from "./history";
import { looksLikeTngWallet, parseTngWallet } from "./tng";
import { parseCsvStatement, type CsvOverrides } from "./csv";
import { extractPdfPages, looksLikePdf, PdfError } from "./pdf-extract";
import { amountColumns, blockDirection, splitRowBlocksPositioned } from "./pdf-lines";
import { blocksHaveHeads, parseStatementText, rowBlocksToLines } from "./statement-text";
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
      const pages = await extractPdfPages(input.bytes, input.password);
      // A Touch 'n Go wallet history is a table turned on its side: it has its own reader (tng.ts).
      const tng = looksLikeTngWallet(pages) ? parseTngWallet(pages) : null;
      let parsed = tng ?? parseStatementText(pages.flatMap((p) => p.map((l) => l.text)));
      // A bank web page printed to PDF spreads each transaction over several lines with the date in the MIDDLE, so
      // reading line by line gives every row its neighbour's head. Read by table row instead, but only for pages that
      // actually look like that and only if it finds at least as many transactions (it never replaces a good reading).
      const positioned = tng ? [] : pages.flatMap((p) => splitRowBlocksPositioned(p));
      const blocks = positioned.map((b) => b.map((l) => l.text));
      if (!tng && blocksHaveHeads(blocks)) {
        // Such pages print each amount under "Money In" or "Money Out": that says which way the money moved for EVERY line,
        // including the oldest one, which has no balance before it to prove it.
        const cols = amountColumns(pages);
        const directions = cols ? positioned.map((b) => blockDirection(b, cols)) : [];
        const byRow = parseStatementText(rowBlocksToLines(blocks, directions));
        if (byRow.rows.length > 0 && byRow.rows.length >= parsed.rows.length) parsed = byRow;
      }
      rows = parsed.rows;
      check = parsed.check;
      openingBalance = parsed.openingBalance;
      closingBalance = parsed.closingBalance;
      warnings = parsed.warnings;
      skipped = parsed.skipped;
      if (tng && account.type !== "ewallet") {
        warnings = [`This is a Touch 'n Go wallet history, but "${account.name}" is a ${account.type === "cash" ? "cash" : "bank"} account. Choose your e-Wallet account instead.`, ...warnings];
      }
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
    // A statement can be genuinely empty: nothing moved all month, so the balance stands where it started.
    if (openingBalance !== null && closingBalance !== null && openingBalance === closingBalance) {
      return { ok: false, error: `This statement has no transactions: the balance stayed at ${formatRM(openingBalance)} the whole time, so there is nothing to import.` };
    }
    return { ok: false, error: warnings[0] ?? "No transactions were found in that file." };
  }

  // The oldest line of a statement that doesn't state its opening balance has no previous balance to prove whether it
  // was money in or out, so its direction is only a guess. But if the books already hold the balance from just before
  // that day (you import month by month), only ONE direction can make the bank's printed balance add up: use it.
  // If neither (or both) does, the books aren't in step with the bank and the guess stays, flagged.
  if (check?.firstRowGuessed && rows[0].balance !== null && countEntriesBefore(db, account.id, rows[0].date) > 0) {
    const first = rows[0];
    const known = booksBalanceBefore(db, account.id, first.date);
    const size = Math.abs(first.amount);
    const asIn = known + size === first.balance;
    const asOut = known - size === first.balance;
    if (asIn !== asOut) {
      rows = [{ ...first, amount: asIn ? size : -size, signedBy: "balance" }, ...rows.slice(1)];
      openingBalance = known;
      check = { ...check, openingBalance: known, firstRowGuessed: false, checked: check.checked + 1, matched: check.matched + 1 };
      warnings = warnings.filter((w) => !/direction .* of the first row is a guess/.test(w));
    }
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
    shares: selectShares(db),
    rules,
    history: learnFromHistory(db),
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
  // Only judge the other side if its own statement has been imported for THESE days: the other account needs some
  // spending or income of its own within 3 days BEFORE the transfer and within 3 days AFTER it. One side only means the
  // transfer sits at the edge of a stretch that isn't imported yet (the first days of a month whose other statement is
  // still to come), where "no matching line" would just mean "not here yet".
  const otherActiveNear = (id: number, date: string) => {
    const t = Date.parse(date);
    const days = (e: ExistingTx) => (Date.parse(e.date) - t) / 86_400_000;
    const own = existing.filter((e) => e.accountId === id && e.type !== "transfer");
    return own.some((e) => days(e) <= 0 && days(e) >= -3) && own.some((e) => days(e) >= 0 && days(e) <= 3);
  };
  for (const r of classified) {
    const p = r.proposal;
    if (p.kind !== "transfer" || p.source === "duplicate" || !p.transferAccountId || accountType.get(p.transferAccountId) === "cash") continue;
    if (otherActiveNear(p.transferAccountId, r.date)) oneSided.push({ date: r.date, amount: r.amount, note: r.description.replace(/\s+/g, " ").slice(0, 70), where: "here" });
  }
  oneSided.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const duplicates = classified.filter((r) => r.proposal.source === "duplicate").length;
  const holds = classified.filter((r) => r.proposal.source === "hold").length;
  const entries = countEntriesBefore(db, account.id, lo);

  // Does this statement pick up where the books for THIS account leave off? When the account already has history, the
  // bank's balance before the first line should equal what the books say it held. If not, either the statement was
  // uploaded for the wrong account (then another account's books often match it exactly) or entries are missing.
  let accountCheck: PreviewOk["accountCheck"] = null;
  // (The opening balance can be trusted when the statement states it, when it is the bank's own balance before a start
  // date, or when the first line's direction was read rather than guessed, as with a print-out's Money In/Out columns.)
  if (openingBalance !== null && entries > 0 && (check?.openingVerified || leftOut > 0 || check?.firstRowGuessed === false)) {
    const books = booksBalanceBefore(db, account.id, lo);
    if (books !== openingBalance) {
      const twin = db
        .select({ id: accounts.id, name: accounts.name, type: accounts.type, openingBalance: accounts.openingBalance })
        .from(accounts)
        .where(eq(accounts.archived, false))
        .all()
        // (An account with no entries yet still counts when it was given a starting balance: a brand-new wallet is the
        // obvious owner of a statement that opens on exactly that figure.)
        .find((a) => a.id !== account.id && a.type !== "investment" && (countEntriesBefore(db, a.id, lo) > 0 || a.openingBalance !== 0) && booksBalanceBefore(db, a.id, lo) === openingBalance);
      accountCheck = { date: lo, statement: openingBalance, books, looksLike: twin ? { id: twin.id, name: twin.name } : null };
    }
  }

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
    accountCheck,
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
