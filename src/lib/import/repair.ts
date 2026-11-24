import { formatRM } from "@/lib/money";
import { checkBalances } from "./reconcile";
import type { StatementRow } from "./types";

/**
 * Repairing a statement that doesn't add up to the bank's own running balance. Pure: rows in, plain data out.
 *
 * `checkBalances` compares every line with the balance printed before it (previous balance + amount = this balance) and already
 * corrects a line whose size is right but whose direction is wrong. What it can only REPORT is a line whose size is off. Each
 * break is explained in plain words, and every candidate fix here is proven by running the very same check again: a fix is only
 * offered when applying it really clears the break (and adds none).
 */

/** A statement line as the repair sees it: the line, plus what the user already did to it in the review. */
export type ChainRow = StatementRow & {
  /** Left out of the chain by the user ("skip this line"): the bank's balance after it is not used either. */
  dropped?: boolean;
  /** A balancing line the user added for the break at this row index. It is not on the statement, so it is not in the chain. */
  adjustFor?: number;
};

export type Fix =
  /** The bank's own balance says this line moved `to`, not `from` (a misread amount, or a direction the check could not settle). */
  | { kind: "amount"; index: number; from: number; to: number }
  /** The balance printed after this line looks misread: with `to` instead of `from`, this line and the next both add up. */
  | { kind: "balance"; index: number; from: number; to: number }
  /** Leave this line out (a line that isn't a real transaction, such as a repeated or phantom row). */
  | { kind: "skip"; index: number; amount: number }
  /** Add a balancing line of `amount` dated like the break. Always asks first: it invents an entry. */
  | { kind: "adjust"; index: number; amount: number };

export type BreakDetail = {
  /** The row index of the line that doesn't add up. */
  index: number;
  /** The balance before it (the previous printed one, or the opening balance). */
  previousBalance: number;
  /** The balance the bank printed after it. */
  printedBalance: number;
  /** What the line says it did. */
  amount: number;
  /** previous balance + the line's amount: where the lines take the account. */
  linesAddTo: number;
  /** printed - linesAddTo: positive = the bank's balance is higher than the lines explain. */
  missing: number;
};

const inChain = (r: ChainRow) => !r.dropped && r.adjustFor === undefined;

function toStatement(rows: ChainRow[]): StatementRow[] {
  return rows.filter(inChain).map((r) => ({ index: r.index, date: r.date, description: r.description, amount: r.amount, balance: r.balance, signedBy: r.signedBy }));
}

/**
 * Row indexes still not adding up. A balancing line added for a break accounts for it when it covers exactly what was missing.
 */
export function chainMismatches(rows: ChainRow[], opening: number | null): number[] {
  const chain = toStatement(rows);
  const broken = checkBalances(chain, opening).check.mismatches;
  if (!broken.length) return broken;
  const adjusts = new Map<number, number>();
  for (const r of rows) if (r.adjustFor !== undefined && !r.dropped) adjusts.set(r.adjustFor, (adjusts.get(r.adjustFor) ?? 0) + r.amount);
  if (!adjusts.size) return broken;
  const details = new Map(breakDetails(rows, opening).map((d) => [d.index, d]));
  return broken.filter((i) => adjusts.get(i) !== details.get(i)?.missing);
}

/** Every break in the chain, with what the bank said and what the lines add up to. */
export function breakDetails(rows: ChainRow[], opening: number | null): BreakDetail[] {
  const out: BreakDetail[] = [];
  let prev = opening;
  for (const r of toStatement(rows)) {
    if (r.balance === null) continue;
    if (prev !== null) {
      const delta = r.balance - prev;
      if (Math.abs(delta) !== Math.abs(r.amount)) {
        out.push({ index: r.index, previousBalance: prev, printedBalance: r.balance, amount: r.amount, linesAddTo: prev + r.amount, missing: delta - r.amount });
      }
    }
    prev = r.balance;
  }
  return out;
}

/** Apply one fix to the rows. The adjusting line gets a negative index (-(index + 1)) so it never collides with a statement line. */
export function applyFix(rows: ChainRow[], fix: Fix): ChainRow[] {
  switch (fix.kind) {
    case "amount":
      return rows.map((r) => (r.index === fix.index ? { ...r, amount: fix.to, signedBy: "balance" as const } : r));
    case "balance":
      return rows.map((r) => (r.index === fix.index ? { ...r, balance: fix.to } : r));
    case "skip":
      return rows.map((r) => (r.index === fix.index ? { ...r, dropped: true } : r));
    case "adjust": {
      const at = rows.findIndex((r) => r.index === fix.index);
      if (at < 0) return rows;
      const base = rows[at];
      const line: ChainRow = {
        index: -(fix.index + 1),
        date: base.date,
        description: "Balancing adjustment",
        amount: fix.amount,
        balance: null,
        signedBy: "guess",
        adjustFor: fix.index,
      };
      return [...rows.slice(0, at), line, ...rows.slice(at)];
    }
  }
}

/**
 * The fixes that provably clear the break at `at`. Order: the ones that correct the reading first (the balance printed on the
 * previous line, then the line's own amount), then leaving the line out, and the balancing line last. Empty when `at` is not a break.
 */
export function repairCandidates(rows: ChainRow[], opening: number | null, at: number, opts: { locked?: ReadonlySet<number> } = {}): Fix[] {
  const details = breakDetails(rows, opening);
  const d = details.find((x) => x.index === at);
  if (!d) return [];
  const before = chainMismatches(rows, opening);
  // A fix is offered only if it clears this break without creating another one.
  const clears = (fix: Fix) => {
    const after = chainMismatches(applyFix(rows, fix), opening);
    return !after.includes(at) && after.length < before.length && after.every((i) => before.includes(i));
  };
  const out: Fix[] = [];
  const chain = toStatement(rows).filter((r) => r.balance !== null);

  // One misread balance breaks TWO neighbouring lines (the next is measured from the wrong figure), and the two errors cancel.
  const pos = chain.findIndex((r) => r.index === at);
  const prevBalanceOf = pos > 0 ? chain[pos - 1].balance : opening;
  if (pos >= 0 && pos < chain.length - 1 && prevBalanceOf !== null) {
    const next = chain[pos + 1];
    const expected = prevBalanceOf + chain[pos].amount;
    if (expected !== d.printedBalance && Math.abs(next.balance! - expected) === Math.abs(next.amount)) {
      const fix: Fix = { kind: "balance", index: at, from: d.printedBalance, to: expected };
      if (clears(fix)) out.push(fix);
    }
  }

  const delta = d.printedBalance - d.previousBalance;
  if (delta !== 0 && delta !== d.amount && !opts.locked?.has(at)) {
    const fix: Fix = { kind: "amount", index: at, from: d.amount, to: delta };
    if (clears(fix)) out.push(fix);
  }

  if (!opts.locked?.has(at)) {
    const fix: Fix = { kind: "skip", index: at, amount: d.amount };
    if (clears(fix)) out.push(fix);
  }

  if (d.missing !== 0) {
    const fix: Fix = { kind: "adjust", index: at, amount: d.missing };
    if (clears(fix)) out.push(fix);
  }
  return out;
}

const signed = (sen: number) => `${sen < 0 ? "−" : "+"}${formatRM(Math.abs(sen))}`;

/** The break in plain words, for someone who has never heard of a running balance. `lineNo` is the line's number on the statement. */
export function describeBreak(d: BreakDetail, lineNo: number): string {
  const gap = formatRM(Math.abs(d.missing));
  const reason =
    d.missing > 0
      ? `The bank has ${gap} more than the lines explain: a line of money in is missing, or this line has the wrong amount or direction.`
      : `The bank has ${gap} less than the lines explain: a line of money out is missing, or this line has the wrong amount or direction.`;
  return `After line ${lineNo} the bank balance is ${formatRM(d.printedBalance)} but the lines add to ${formatRM(d.linesAddTo)} (${formatRM(d.previousBalance)} before it ${signed(d.amount)}). ${reason}`;
}

/** The words on a fix's button, and what it does when tapped. */
export function describeFix(fix: Fix, lineNo: number): { label: string; detail: string } {
  switch (fix.kind) {
    case "amount":
      return {
        label: `Use the bank's figure for line ${lineNo}`,
        detail: `The bank's balance moved ${signed(fix.to)} there, not ${signed(fix.from)}. Change the line to ${signed(fix.to)}.`,
      };
    case "balance":
      return {
        label: `The balance after line ${lineNo} was misread`,
        detail: `Read as ${formatRM(fix.from)}, it should be ${formatRM(fix.to)}: with that, this line and the next both add up. Your entries don't change.`,
      };
    case "skip":
      return { label: `Leave line ${lineNo} out`, detail: `It will not be imported, and the bank's balance printed on it is not used. Leaving it out clears the break.` };
    case "adjust":
      return { label: `Add a balancing line of ${signed(fix.amount)}`, detail: `A new entry of ${signed(fix.amount)} that is not on the statement, so the account reaches the bank's balance. You choose its category.` };
  }
}
