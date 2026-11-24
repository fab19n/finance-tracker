import { shiftDays } from "@/lib/dates";
import { pickShare, type ShareDef } from "./shares";

/**
 * Which money in is offered as "maybe somebody's payment" (pure). Two groups:
 *  - `main`: what is very likely a payment. Anything filed under Reimbursements is ALWAYS here (a payment you typed
 *    yourself must never be hidden by an amount window or an age cutoff); money in other candidate categories is here
 *    when it is a plausible amount (one month of the smallest share up to a year of the largest) and recent.
 *  - `other`: the same kind of money that fails that test (an odd amount, an old entry). Offered behind "Show all money
 *    in", so a real payment of an unusual size can still be counted.
 */

export const MAX_MONTHS_PREPAID = 12;
export const CLAIM_LOOKBACK_DAYS = 400;
export const ALWAYS_OFFERED_CATEGORY = "Reimbursements";

export type ClaimRow = { id: number; date: string; amount: number; note: string | null; item: string | null; categoryName: string };
export type ClaimCredit = { id: number; date: string; amount: number; description: string; suggestedShareId: number | null };

type Person = Pick<ShareDef, "name" | "matchKeywords" | "share" | "active"> & { id: number; earlierShares?: number[] };

export function splitClaims(rows: ClaimRow[], people: Person[], today: string): { main: ClaimCredit[]; other: ClaimCredit[] } {
  const active = people.filter((p) => p.active && p.share > 0);
  if (active.length === 0) return { main: [], other: [] };
  const lo = Math.min(...active.map((p) => p.share));
  const hi = Math.max(...active.map((p) => p.share)) * MAX_MONTHS_PREPAID;
  const cutoff = shiftDays(today, -CLAIM_LOOKBACK_DAYS);
  const credit = (r: ClaimRow): ClaimCredit => ({
    id: r.id,
    date: r.date,
    amount: r.amount,
    description: r.note ?? r.item ?? "",
    suggestedShareId: pickShare(people as (Person & { earlierShares: number[] })[], [r.note, r.item].filter(Boolean).join(" "), r.amount)?.id ?? null,
  });
  const main: ClaimCredit[] = [];
  const other: ClaimCredit[] = [];
  // Newest first within each group (ids break ties so the order never reshuffles).
  const sorted = [...rows].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
  for (const r of sorted) {
    const plausible = r.amount >= lo && r.amount <= hi && r.date >= cutoff;
    (r.categoryName === ALWAYS_OFFERED_CATEGORY || plausible ? main : other).push(credit(r));
  }
  // Where the app can already tell who it is from, show that first: those are one tap each (stable sort keeps newest first).
  main.sort((a, b) => Number(b.suggestedShareId !== null) - Number(a.suggestedShareId !== null));
  return { main, other };
}

/** What to prefill when marking somebody paid: what they owe now, else what is expected next, else one month. */
export function suggestedPayment(p: { owedNow: number; expectedNext: number }, oneMonth: number): number {
  if (p.owedNow > 0) return p.owedNow;
  if (p.expectedNext > 0) return p.expectedNext;
  return oneMonth;
}
