import type { BillInCycle } from "./bills";

export type SafeToSpend = {
  /** Is a "spending" account chosen in Settings? Without one there is nothing to compute. */
  configured: boolean;
  accountName: string | null;
  balance: number;
  /** Money held back for bills not yet paid this cycle. */
  reserve: number;
  /** balance - reserve. Negative means everyday spending will be funded from savings. */
  safe: number;
  perDay: number | null;
  daysLeft: number;
  unpaidCount: number;
  overdueCount: number;
};

/**
 * What is left in ONE account after the bills it still has to pay this cycle. `items` are this cycle's checklist entries for
 * the bills paid from that account (a bill paid from another account never draws on this balance). Pure: the Plan page uses
 * it for the spending account (the "safe to spend" card) and, with the same maths, for any account you choose to look at.
 */
export function safeToSpend(p: { accountName: string; balance: number; items: BillInCycle[]; daysLeft: number }): SafeToSpend {
  const reserve = p.items.reduce((s, e) => s + e.reserve, 0);
  const left = p.balance - reserve;
  return {
    configured: true,
    accountName: p.accountName,
    balance: p.balance,
    reserve,
    safe: left,
    perDay: p.daysLeft > 0 ? Math.round(left / p.daysLeft) : null,
    daysLeft: p.daysLeft,
    unpaidCount: p.items.filter((e) => e.status !== "paid").length,
    overdueCount: p.items.filter((e) => e.status === "overdue").length,
  };
}

/** This cycle's bills that are paid from one account. */
export const billsPaidFrom = <T extends { bill: { accountId: number } }>(items: T[], accountId: number): T[] =>
  items.filter((e) => e.bill.accountId === accountId);
