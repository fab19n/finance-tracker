import type { BalanceCheck, StatementRow } from "./types";

/**
 * The safety net. A bank statement prints a running balance after every line, so
 *
 *     previous balance + this line's amount = this line's balance
 *
 * must hold for every row. If it does, the parse is provably right (dates aside): wrong columns, flipped signs
 * and misread amounts all break the chain. This both FIXES signs (when only the size of an amount is printed,
 * the direction of the balance change says whether it was money in or out) and REPORTS anything that doesn't add up.
 */
export function checkBalances(rows: StatementRow[], openingBalance: number | null): { rows: StatementRow[]; check: BalanceCheck } {
  const out: StatementRow[] = [];
  const mismatches: number[] = [];
  let prev = openingBalance;
  let checked = 0;
  let matched = 0;
  let inferredOpening: number | null = null;
  let firstRowGuessed = false;

  for (const row of rows) {
    let r = row;
    if (row.balance !== null) {
      if (prev !== null) {
        checked++;
        const delta = row.balance - prev;
        if (delta === row.amount) {
          matched++;
          if (row.signedBy !== "balance") r = { ...row, signedBy: "balance" };
        } else if (Math.abs(delta) === Math.abs(row.amount)) {
          // Same size, opposite direction: the bank's balance says which way the money moved.
          matched++;
          r = { ...row, amount: delta, signedBy: "balance" };
        } else {
          mismatches.push(row.index);
        }
      } else if (inferredOpening === null) {
        inferredOpening = row.balance - row.amount;
        firstRowGuessed = row.signedBy === "guess";
      }
      prev = row.balance;
    }
    out.push(r);
  }

  const opening = openingBalance ?? inferredOpening;
  return {
    rows: out,
    check: {
      checked,
      matched,
      mismatches,
      openingBalance: opening,
      // Only a balance the statement itself STATED, and the first row then agreed with, counts as verified.
      // One inferred from the first row's (possibly guessed) sign is just a suggestion.
      openingVerified: openingBalance !== null && checked > 0 && mismatches.length === 0,
      firstRowGuessed,
    },
  };
}

/** Plain-English warnings for the review screen. Empty when everything reconciles. */
export function describeCheck(check: BalanceCheck): string[] {
  const out: string[] = [];
  if (check.mismatches.length) {
    out.push(
      `${check.mismatches.length} row${check.mismatches.length === 1 ? "" : "s"} don't add up to the statement's running balance - check ${check.mismatches.length === 1 ? "it" : "them"} before importing.`,
    );
  }
  if (check.firstRowGuessed) {
    out.push("The statement doesn't state an opening balance, so the direction (money in or out) of the first row is a guess - check it.");
  }
  return out;
}
