import { formatRM } from "@/lib/money";
import { planPayday } from "./payday";
import type { CycleFlow } from "./savings-flow";

/** The payday plan as the board's short statement: what comes in, what the bills take, what is kept, what goes to savings. */
export type PaydayStatement = {
  salary: number;
  bills: number;
  /** Everyday allowance plus buffer: kept in the spending account. */
  kept: number;
  toSavings: number;
  /** Bills + allowance + buffer more than the pay (0 when the plan fits). */
  deficit: number;
};

export function paydayStatement(i: { income: number; bills: number; allowance: number; buffer: number }): PaydayStatement {
  const p = planPayday(i);
  return { salary: i.income, bills: i.bills, kept: i.allowance + i.buffer, toSavings: p.moveToSavings, deficit: p.deficit };
}

export type SavingsSummary = {
  /** The one sentence. */
  text: string;
  /** How much of the plan was moved, 0..1 (null when nothing was planned). */
  fraction: number | null;
  /** What came back out of savings (taken back by transfer or paid straight from it). */
  out: number;
};

/**
 * "You planned RM 800 and moved RM 800. Nothing was drawn back out this cycle." from a cycle's real flows. `planned` is
 * the payday plan's move (null when no plan can be made, e.g. no pay known yet); the rest comes from the cycle's transfers.
 */
export function savingsSummary(flow: Pick<CycleFlow, "deposited" | "drawn" | "spentFromSavings" | "trueSaved" | "complete">, planned: number | null): SavingsSummary {
  const out = flow.drawn + flow.spentFromSavings;
  const moved = formatRM(flow.deposited);
  const when = flow.complete ? "that cycle" : "this cycle";
  let first: string;
  if (planned !== null && planned > 0) {
    first = flow.deposited > 0 ? `You planned ${formatRM(planned)} and moved ${moved}.` : `You planned ${formatRM(planned)} and ${flow.complete ? "moved nothing" : "have not moved anything yet"}.`;
  } else {
    first = flow.deposited > 0 ? `You moved ${moved} to savings ${when}.` : `Nothing was moved to savings ${when}.`;
  }
  const second =
    out === 0
      ? flow.deposited > 0
        ? ` Nothing was drawn back out ${when}.`
        : ""
      : ` ${formatRM(out)} came back out, so you really saved ${formatRM(Math.max(0, flow.trueSaved))}.`;
  const fraction = planned !== null && planned > 0 ? Math.max(0, Math.min(1, flow.deposited / planned)) : null;
  return { text: first + second, fraction, out };
}
