import type { ClassifiedRow } from "./classify";
import type { BalanceCheck, CsvLayout } from "./types";

/** What the server sends the review screen. Plain data only (it crosses the server/client boundary). */

export type PreviewOk = {
  ok: true;
  mode: "pdf" | "csv" | "text";
  rows: ClassifiedRow[];
  check: BalanceCheck;
  openingBalance: number | null;
  closingBalance: number | null;
  warnings: string[];
  /** A few lines the reader couldn't make sense of, for troubleshooting. */
  skipped: string[];
  dateRange: { from: string; to: string } | null;
  /** Lines before the chosen start date that were left out (0 when no start date was given). */
  leftOut: number;
  /**
   * Transfers between your own accounts that appear on only ONE side, which is where money has gone to an account
   * that isn't tracked here. `amount` is from this account's point of view (positive = money in).
   * where "other": recorded from the other account's statement, but this statement has no matching line.
   * where "here": in this statement, but the other account's imported history has no matching line.
   */
  oneSided: { date: string; amount: number; note: string; where: "other" | "here" }[];
  /**
   * Set when the account already has history but the bank's balance at the start of this statement (`statement`) is
   * not what the books say it held then (`books`). `looksLike` names another account whose books DO match, which
   * means the statement was most likely uploaded for the wrong account.
   */
  accountCheck: { date: string; statement: number; books: number; looksLike: { id: number; name: string } | null } | null;
  /** `holds` = card pre-authorisations and their refunds, and transfers the bank reversed: they cancel out and are skipped. */
  stats: { total: number; fresh: number; duplicates: number; holds: number; needsReview: number };
  /**
   * For the optional "set the opening balance so the books match the bank" step. `existingEntries` counts entries
   * on the account dated BEFORE the statement's first line: only when it is 0 can the starting balance be set.
   */
  account: { id: number; name: string; existingEntries: number; openingBalance: number };
  /** CSV only: what the columns were read as, so a wrong guess can be corrected. */
  csv?: { headers: string[]; sample: string[][]; layout: CsvLayout };
};

export type PreviewErr = {
  ok: false;
  error: string;
  /** The PDF is protected: ask for a password. */
  needPassword?: boolean;
  passwordWrong?: boolean;
  /** CSV with no recognisable header: show these rows so columns can be chosen by hand. */
  mapping?: { sample: string[][] };
};

export type PreviewResult = PreviewOk | PreviewErr;

export type CommitRow = {
  key: string;
  date: string;
  /** Signed sen as on the statement: negative = money left the account. */
  amount: number;
  description: string;
  kind: "expense" | "income" | "transfer" | "skip";
  categoryId: number | null;
  item: string;
  billId: number | null;
  /** Money in only: the person sharing one of your bills whose payment this is. Absent = nobody's. */
  shareId?: number | null;
  transferAccountId: number | null;
  /** Teach it: next time a description like this arrives, decide the same way. */
  remember: boolean;
};

export type CommitInput = {
  accountId: number;
  rows: CommitRow[];
  /** Set the account's opening balance to this (sen), only if the account has no entries yet. */
  setOpeningBalance: number | null;
};

export type CommitResult =
  | { ok: true; imported: number; skipped: number; transfers: number; rulesSaved: number; openingSet: boolean }
  | { ok: false; error: string };
