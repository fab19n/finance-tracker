/** Shared by the parsers, the server actions and the review screen (so everything here must be plain data). */

export type StatementRow = {
  /** Position in the statement, after sorting into date order. */
  index: number;
  date: string; // YYYY-MM-DD
  description: string;
  /** Signed sen: positive = money in, negative = money out. */
  amount: number;
  /** The running balance the bank printed after this row, when there is one. */
  balance: number | null;
  /** How the sign was decided. 'balance' is the strongest: it matches the bank's own running total. */
  signedBy: "balance" | "hint" | "column" | "guess";
};

export type ParsedStatement = {
  rows: StatementRow[];
  /** Balance before the first row, when the statement states one. */
  openingBalance: number | null;
  closingBalance: number | null;
  /** Lines that looked like they might matter but couldn't be read (a sample, for troubleshooting). */
  skipped: string[];
  warnings: string[];
};

/** Result of checking parsed rows against the bank's own running balance. */
export type BalanceCheck = {
  /** Rows that could be compared with the previous balance. */
  checked: number;
  matched: number;
  /** Row indexes where previous balance + amount does not equal the printed balance. */
  mismatches: number[];
  /** Balance the account held before the first row (stated, or worked out from the first row). */
  openingBalance: number | null;
  /** True when openingBalance was stated by the statement and the rows then agreed with it. */
  openingVerified: boolean;
  /** No opening balance was stated, so the FIRST row's direction (money in/out) is only a guess. */
  firstRowGuessed: boolean;
};

export type CsvLayout = {
  headerRow: number;
  date: number | null;
  description: number[];
  debit: number | null;
  credit: number | null;
  amount: number | null;
  balance: number | null;
  dateFormat: DateFormat;
};

export type DateFormat = "dmy" | "mdy" | "ymd";
