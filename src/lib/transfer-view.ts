type Transfer = { accountId: number; toAccountId: number | null; accountName: string | null; toAccountName: string | null };

/**
 * How a transfer reads from ONE account's point of view. A transfer is a single entry on two accounts; in a list of
 * everything it has no sign (it is neither income nor spending), but in one account's list it is money going out or
 * coming in, and that is what you want to follow ("where did the RM 300 go?").
 *
 * `viewing` is the account being looked at, or null for the whole-book list.
 */
export function transferView(tx: Transfer, viewing: number | null): { title: string; sign: "-" | "+" | "" } {
  if (viewing !== null && tx.accountId === viewing && tx.toAccountName) return { title: `Transfer to ${tx.toAccountName}`, sign: "-" };
  if (viewing !== null && tx.toAccountId === viewing && tx.accountName) return { title: `Transfer from ${tx.accountName}`, sign: "+" };
  return { title: "Transfer", sign: "" };
}
