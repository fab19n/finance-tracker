import { normalizeName } from "@/lib/plan/bills";
import type { StatementRow } from "./types";

/**
 * Card holds. Online merchants often "pre-authorise" a card: the bank shows a debit, then a refund of the same
 * amount a day or two later, and the money never really left. Importing both would put the debit in your spending
 * AND the refund in your income. They cancel out, so they are skipped together.
 *
 * Starts from the refund (its description says PRE-AUTH REFUND / REV PREAUTH, so it can't be anything else) and
 * looks for the debit it released: same amount, same merchant, within 3 days.
 *
 * Reversals are the same idea. A transfer the bank could not complete is debited, then put back with a line like
 * "TRNSFR FROM A/C REV" (no merchant to compare, and worded differently from the original), so that second pass
 * pairs a REV / REVERSAL line with an equal, opposite line no more than 3 days before it.
 */

const WRAPPERS = /^(?:(?:sale debit|pre auth debit|pre auth refund|pre auth mydebit|rev preauth mydebit|payment via mydebit|mydebit purchase|pos debit)\s+)+/;
const IS_AUTH = /\bpre ?auth\b/;
// "PYMT VIA MYDEBIT RE" is Maybank's cut-off wording for a debit-card payment that was reversed.
const IS_REVERSAL = /\b(?:rev|reversal|reversed)\b|\bpymt via mydebit re\b/;
const MAX_GAP_DAYS = 3;

/** First two words of the merchant, without the "SALE DEBIT / PRE-AUTH ..." wrapper. */
export function merchantKey(description: string): string {
  return normalizeName(description).replace(WRAPPERS, "").split(" ").slice(0, 2).join(" ");
}

const gap = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** Row index -> why it is skipped, for both halves of every hold released, or entry reversed, within this statement. */
export function findCardHolds(rows: StatementRow[]): Map<number, string> {
  const out = new Map<number, string>();
  const used = new Set<number>();
  for (const release of rows) {
    if (release.amount <= 0 || !IS_AUTH.test(normalizeName(release.description))) continue;
    const key = merchantKey(release.description);
    if (!key) continue;
    const debit = rows
      .filter((d) => d.amount === -release.amount && !used.has(d.index) && merchantKey(d.description) === key && gap(d.date, release.date) <= MAX_GAP_DAYS)
      .sort((a, b) => Number(IS_AUTH.test(normalizeName(b.description))) - Number(IS_AUTH.test(normalizeName(a.description))) || gap(a.date, release.date) - gap(b.date, release.date))[0];
    if (!debit) continue;
    used.add(debit.index);
    used.add(release.index);
    const why = `Card hold released (${key}): the authorisation and its refund cancel out`;
    out.set(debit.index, why);
    out.set(release.index, why);
  }

  for (const reversal of rows) {
    if (used.has(reversal.index) || IS_AUTH.test(normalizeName(reversal.description)) || !IS_REVERSAL.test(normalizeName(reversal.description))) continue;
    const original = rows
      .filter((o) => o.index !== reversal.index && o.amount === -reversal.amount && !used.has(o.index) && !IS_REVERSAL.test(normalizeName(o.description)) && o.date <= reversal.date && gap(o.date, reversal.date) <= MAX_GAP_DAYS)
      .sort((a, b) => Math.abs(a.index - reversal.index) - Math.abs(b.index - reversal.index))[0];
    if (!original) continue;
    used.add(original.index);
    used.add(reversal.index);
    const why = `Reversed by the bank: RM ${(Math.abs(reversal.amount) / 100).toFixed(2)} ${original.amount < 0 ? "went out and was put straight back" : "came in and was taken straight back"}, so nothing changed`;
    out.set(original.index, why);
    out.set(reversal.index, why);
  }
  return out;
}
