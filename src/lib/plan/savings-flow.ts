import { shiftDays } from "@/lib/dates";
import { normalizeName } from "./bills";
import { roundToFifty } from "./payday";

/**
 * The savings reality check. Moving money between your own accounts is not spending, so topping up the main
 * account from savings hides where money really goes. This reads each pay cycle and answers:
 *
 *   - how much did I put into savings, and how much did I take back out?
 *   - was that because my payday split never left enough for the bills (a planning gap, fixable),
 *     or because everyday spending ran past what was left (overspending)?
 *   - what did I REALLY save?
 */

export type FlowTx = {
  id: number;
  date: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  accountId: number;
  toAccountId: number | null;
  billId: number | null;
  item: string | null;
  /** Category name, used to say WHAT was paid straight from savings. */
  category?: string | null;
};

export type FlowContext = {
  spendingId: number | null;
  savingsId: number | null;
  /** normalizeName() of every bill's name, so a typed-in "Netflix" still counts as the Netflix bill. */
  billNames: Set<string>;
};

export type CycleFlow = {
  start: string;
  end: string;
  complete: boolean;
  income: number;
  /** Main -> savings transfers. */
  deposited: number;
  /** Savings -> main transfers (the "top-ups"). */
  drawn: number;
  /** Bills paid from any account. */
  billsPaid: number;
  /** The part of that paid out of the spending account: what the money left behind at payday has to cover. */
  billsFromSpending: number;
  /** Everything else you spent: groceries, fuel, food, small things (any account). */
  variable: number;
  /** Spending paid straight out of the savings account (rent, subscriptions, groceries...) rather than via a top-up. */
  spentFromSavings: number;
  /** The biggest categories of that, largest first. */
  savingsSpendTop: { name: string; amount: number }[];
  /** What was moved to savings in the first week of the cycle (payday), ignoring one-off transfers later on. */
  paydayDeposit: number;
  /** What stayed in the main account after the savings transfer. */
  leftAfterDeposit: number;
  /** Top-ups that were unavoidable because the payday split left less than the bills needed. */
  planningGap: number;
  /** Top-ups beyond that: everyday spending that ran past what was left. */
  everydayFromSavings: number;
  /** deposited - drawn: how much savings actually grew by (before interest). */
  netSaved: number;
  /** income - bills - everyday spending: the true amount left over. */
  trueSaved: number;
  trueRate: number | null;
};

export function cycleFlow(range: { start: string; end: string; complete: boolean }, txs: FlowTx[], ctx: FlowContext): CycleFlow {
  const inCycle = txs.filter((t) => t.date >= range.start && t.date <= range.end);
  const sum = (xs: FlowTx[]) => xs.reduce((s, t) => s + t.amount, 0);
  const isBill = (t: FlowTx) => t.billId != null || ctx.billNames.has(normalizeName(t.item));

  const income = sum(inCycle.filter((t) => t.type === "income"));
  const expenses = inCycle.filter((t) => t.type === "expense");
  const billsPaid = sum(expenses.filter(isBill));
  const variable = sum(expenses.filter((t) => !isBill(t)));

  const { spendingId, savingsId } = ctx;
  const transfers = inCycle.filter((t) => t.type === "transfer");
  const depositTxs = spendingId && savingsId ? transfers.filter((t) => t.accountId === spendingId && t.toAccountId === savingsId) : [];
  const deposited = sum(depositTxs);
  const drawn = spendingId && savingsId ? sum(transfers.filter((t) => t.accountId === savingsId && t.toAccountId === spendingId)) : 0;
  const paydayWeek = shiftDays(range.start, 6);
  const paydayDeposit = sum(depositTxs.filter((t) => t.date <= paydayWeek)) || deposited;

  // Spending that never went through the spending account: it left savings directly, so it is not a "top-up".
  const fromSavings = savingsId ? expenses.filter((t) => t.accountId === savingsId) : [];
  const spentFromSavings = sum(fromSavings);
  const billsFromSpending = billsPaid - sum(fromSavings.filter(isBill));
  const byCategory = new Map<string, number>();
  for (const t of fromSavings) byCategory.set(t.category ?? "Other", (byCategory.get(t.category ?? "Other") ?? 0) + t.amount);
  const savingsSpendTop = [...byCategory].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 3);

  const leftAfterDeposit = income - deposited;
  // If what was left had gone to bills first, this much of the bills it must cover would have been uncovered.
  const planningGap = Math.min(drawn, Math.max(0, billsFromSpending - leftAfterDeposit));
  const trueSaved = income - billsPaid - variable;

  return {
    ...range,
    income,
    deposited,
    drawn,
    billsPaid,
    billsFromSpending,
    spentFromSavings,
    savingsSpendTop,
    paydayDeposit,
    variable,
    leftAfterDeposit,
    planningGap,
    everydayFromSavings: drawn - planningGap,
    netSaved: deposited - drawn,
    trueSaved,
    trueRate: income > 0 ? trueSaved / income : null,
  };
}

/** A friendly everyday allowance from past behaviour: the average of up to 3 completed cycles, nearest RM 50. */
export function estimateAllowance(flows: CycleFlow[]): number | null {
  const done = flows.filter((f) => f.complete && f.income > 0 && f.variable > 0).slice(0, 3);
  if (!done.length) return null;
  return roundToFifty(done.reduce((s, f) => s + f.variable, 0) / done.length);
}
