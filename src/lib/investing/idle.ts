/**
 * "My savings just sit there." An emergency fund must stay SAFE and REACHABLE, but not all of it has to be
 * reachable in minutes. Tiers:
 *
 *   instant  - about one month of costs, in the everyday savings account, for true emergencies
 *   parkable - the rest of the emergency fund: can sit in a fixed deposit or money-market fund that pays more
 *              and can still be broken or redeemed within days
 *   excess   - anything above the emergency goal: that is real "extra money" (see the advisor)
 *
 * Illustrative arithmetic on YOUR assumed rates (Settings), not a recommendation of any product.
 */

export type SavingsOpportunity = {
  balance: number;
  /** Monthly costs the emergency fund has to cover. */
  monthlyCosts: number;
  monthsCovered: number;
  targetMonths: number;
  /** Emergency-fund goal in sen (targetMonths x monthlyCosts). */
  goal: number;
  funded: boolean;
  instant: number;
  parkable: number;
  excess: number;
  /** Interest per year at the savings account's current rate. */
  earnsNow: number;
  /** Extra interest per year if the parkable + excess money earned the fixed-deposit rate instead. */
  extraPerYear: number;
  /** The FD rate is not above what the savings account already pays: nothing to gain. */
  noGain: boolean;
};

export function savingsOpportunity(i: {
  balance: number; // sen
  monthlyCosts: number; // sen
  targetMonths: number;
  savingsRatePct: number;
  fdRatePct: number;
}): SavingsOpportunity {
  const balance = Math.max(0, i.balance);
  const costs = Math.max(0, i.monthlyCosts);
  const goal = Math.round(costs * i.targetMonths);
  const instant = Math.min(balance, costs);
  const parkable = Math.max(0, Math.min(balance, goal) - instant);
  const excess = Math.max(0, balance - goal);
  const spread = i.fdRatePct - i.savingsRatePct;
  return {
    balance,
    monthlyCosts: costs,
    monthsCovered: costs > 0 ? balance / costs : 0,
    targetMonths: i.targetMonths,
    goal,
    funded: goal > 0 && balance >= goal,
    instant,
    parkable,
    excess,
    earnsNow: Math.round((balance * i.savingsRatePct) / 100),
    extraPerYear: spread > 0 ? Math.round(((parkable + excess) * spread) / 100) : 0,
    noGain: spread <= 0,
  };
}
