/**
 * "Update balance": for an account that pays interest a little every day. You type what the bank shows; whatever it has
 * above the app's own figure is recorded as ONE interest entry, instead of an entry per day. Pure (numbers in, a verdict
 * out) and unit-tested; `app/actions/balance.ts` does the reading and writing.
 */

/**
 * More than this above the books is a lot to be interest, and is more likely money moved in that was never recorded:
 * 1% of the balance (about three months at 4% a year), and never less than RM 5.
 */
export const unusualAbove = (books: number): number => Math.max(500, Math.round(Math.max(0, books) / 100));

export type BalanceVerdict =
  | { kind: "match" }
  /** The bank shows LESS than the app: never interest, so nothing is recorded. */
  | { kind: "lower"; short: number }
  | { kind: "interest"; amount: number; unusual: boolean };

/** `books` is what the app says the account held at the end of the day, `shown` what the bank says; both in sen. */
export function judgeBalance(books: number, shown: number): BalanceVerdict {
  const amount = shown - books;
  if (amount === 0) return { kind: "match" };
  if (amount < 0) return { kind: "lower", short: -amount };
  return { kind: "interest", amount, unusual: amount > unusualAbove(books) };
}

/** The income category the entry goes under: your own "Interest" if you have one, else the usual ones. */
export const INTEREST_CATEGORIES = ["Interest", "Investment Income", "Other Income"] as const;

export function interestCategory<T extends { name: string }>(income: readonly T[]): T | undefined {
  for (const wanted of INTEREST_CATEGORIES) {
    const found = income.find((c) => c.name.trim().toLowerCase() === wanted.toLowerCase());
    if (found) return found;
  }
  return income[0];
}

export type BalanceUpdateInput = {
  accountId: number;
  /** As typed, in ringgit. */
  balance: string;
  /** The day the bank showed it, YYYY-MM-DD. */
  date: string;
  /** The interest, in sen, that was on screen when Record was pressed. Nothing is recorded unless it still holds. */
  confirm?: number;
  /** Ticked when the amount is unusually large: "it's all interest". */
  trusted?: boolean;
};

export type BalanceUpdateResult =
  | { kind: "error" | "match" | "lower" | "recorded"; message: string }
  | { kind: "confirm"; interest: number; books: number; shown: number; category: string; unusual: boolean; needsTick: boolean };
