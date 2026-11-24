/**
 * Which lines of an import review "need a look". Pure, so the rule is tested without a browser.
 *
 * A line that needed a look stays in that list after you edit it, until you confirm it ("Looks right", or by leaving the
 * tab), so it doesn't vanish under your finger on the first keystroke. Lines that cannot be imported as they are (no
 * category, no other account) and lines that don't add up to the bank's running balance stay until fixed.
 */
export type ReviewRow = {
  index: number;
  kind: "expense" | "income" | "transfer" | "skip";
  categoryId: number | null;
  transferAccountId: number | null;
  signedBy?: string;
  proposal: { confidence: string };
  /** You said "Looks right" (or left the tab after editing it). */
  confirmed: boolean;
  /** It was flagged when you first changed it, so it stays flagged until confirmed. */
  watch: boolean;
};

/** A line that can't be saved yet. */
export function rowIncomplete(r: Pick<ReviewRow, "kind" | "categoryId" | "transferAccountId">): boolean {
  if (r.kind === "skip") return false;
  if (r.kind === "transfer") return !r.transferAccountId;
  return !r.categoryId;
}

export function needsLook(r: ReviewRow, mismatch: ReadonlySet<number>): boolean {
  if (r.kind === "skip") return false;
  if (mismatch.has(r.index) || rowIncomplete(r)) return true;
  return !r.confirmed && (r.proposal.confidence === "low" || r.signedBy === "guess" || r.watch);
}

/** The flag to keep on a line after a change: once flagged and unconfirmed, it stays watched. */
export function watchAfterEdit(before: ReviewRow, after: ReviewRow, mismatch: ReadonlySet<number>): boolean {
  return before.watch || needsLook(before, mismatch) || needsLook({ ...after, confirmed: false }, mismatch);
}

/** Leaving the "Needs a look" tab: lines you changed and that are complete count as looked at. */
export function confirmEdited<T extends ReviewRow & { edited: boolean }>(rows: T[]): T[] {
  return rows.map((r) => (r.edited && !r.confirmed && !rowIncomplete(r) ? { ...r, confirmed: true } : r));
}
