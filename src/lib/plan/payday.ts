/**
 * The payday plan: decide, once, how salary is split - instead of topping up bill by bill all month.
 *
 *   keep in the main account = bills + everyday allowance + a small buffer
 *   move to savings          = whatever is genuinely left over (one transfer)
 */

export type PaydayInput = {
  income: number; // sen
  /** All the bills to be paid this cycle. */
  bills: number;
  /** What you allow yourself for groceries, fuel, Touch 'n Go, food, small things. */
  allowance: number;
  buffer: number;
  /** What you usually move to savings today, to compare against. */
  usualTransfer?: number;
};

export type PaydayPlan = {
  keepInMain: number;
  moveToSavings: number;
  /** Positive when bills + allowance + buffer exceed income: the plan doesn't fit. */
  deficit: number;
  /** Share of income moved to savings. */
  savingsRate: number | null;
  /** How the usual habit compares (only when `usualTransfer` was given). */
  usual: {
    transfer: number;
    leftInMain: number;
    /** Bills that the money left behind can't cover: this much must be pulled back from savings. */
    billsGap: number;
    /** What remains for everyday spending after bills; negative means more must come from savings. */
    leftForEveryday: number;
    /** How much of the usual transfer is really just going to be taken back out. */
    takenBackAtLeast: number;
  } | null;
};

export function planPayday(i: PaydayInput): PaydayPlan {
  const keepInMain = i.bills + i.allowance + i.buffer;
  const moveToSavings = Math.max(0, i.income - keepInMain);
  const usual =
    i.usualTransfer === undefined
      ? null
      : (() => {
          const leftInMain = i.income - i.usualTransfer;
          const billsGap = Math.max(0, i.bills - leftInMain);
          const leftForEveryday = leftInMain - i.bills;
          return {
            transfer: i.usualTransfer,
            leftInMain,
            billsGap,
            leftForEveryday,
            // Bills alone force this back out; spending beyond the allowance takes more.
            takenBackAtLeast: billsGap + Math.max(0, i.allowance - Math.max(0, leftForEveryday)),
          };
        })();
  return {
    keepInMain,
    moveToSavings,
    deficit: Math.max(0, keepInMain - i.income),
    savingsRate: i.income > 0 ? moveToSavings / i.income : null,
    usual,
  };
}

/** Round to the nearest RM 50, for friendly suggested allowances. */
export const roundToFifty = (sen: number) => Math.round(sen / 5000) * 5000;
