import { formatPct, formatRM, formatRMWhole } from "@/lib/money";
import { shortMonthLabel } from "@/lib/dates";
import type { BudgetRow } from "./summary";

/**
 * Words and small decisions for the Home page and its charts, kept out of the JSX so they can be tested in Node.
 *
 * One vocabulary for "what is left": HOME says "Left over" (this period's income minus what was spent); the PLAN says
 * "Safe to spend" (what you can spend before payday). They are different numbers, so they never share a name.
 */

/** A month key as a name a person reads as a month, never as a day: "Oct", with the year only when it differs. "Oct cycle" for a pay cycle. */
export function periodName(month: string, viewed: string, cycle: boolean): string {
  const [mon, yy] = shortMonthLabel(month).split(" ");
  const sameYear = month.slice(0, 4) === viewed.slice(0, 4);
  const base = sameYear ? mon : `${mon} ’${yy}`;
  return cycle ? `${base} cycle` : base;
}

/** The accessible name of a budget row link: the figures and the state, then where it goes. */
export function budgetLabel(b: Pick<BudgetRow, "name" | "spent" | "budget" | "status" | "settled" | "projected" | "billsDue">): string {
  const state =
    b.status === "over"
      ? `over by ${formatRM(b.spent - b.budget)}`
      : b.settled
        ? "bills paid, nothing more due"
        : b.status === "watch"
          ? `on pace to reach ${formatRM(b.projected)}`
          : b.billsDue > 0
            ? `on track, ${formatRM(b.billsDue)} in bills still due`
            : "on track";
  return `${b.name}: ${formatRM(b.spent)} of ${formatRM(b.budget)} budget, ${state}. See its entries`;
}

/** The accessible name of a "where it went" / "by account" row link. */
export function shareLabel(name: string, total: number, share: number): string {
  return `${name}: ${formatRM(total)} spent, ${formatPct(share)}. See its entries`;
}

/** The pill under a phone budget ring: same facts as the list from md up, shorter. */
export function ringPill(b: Pick<BudgetRow, "status" | "settled" | "spent" | "budget" | "projected">): string {
  if (b.status === "over") return `Over by ${formatRMWhole(b.spent - b.budget)}`;
  if (b.settled) return "Bills paid";
  if (b.status === "watch") return `On pace for ${formatRMWhole(b.projected)}`;
  return "On track";
}

/** Font size classes for a big figure: a long amount steps down so it never clips (375 px phones, three tiles to a row). */
export function kpiSizeClass(value: string): string {
  if (value.length > 11) return "text-xs md:text-lg";
  if (value.length > 9) return "text-sm md:text-xl";
  return "text-base md:text-2xl";
}

/** The hero figure: 54 px on a phone while it fits, smaller as it grows. */
export function heroSizeClass(value: string): string {
  if (value.length > 11) return "text-[34px] md:text-[28px]";
  if (value.length > 9) return "text-[42px] md:text-[34px]";
  return "text-[54px] md:text-[44px]";
}

/** The ARIA numbers for a meter: the value is clamped to the scale, and the text says the real figure and the pace. */
export function meterAria(used: number, pace?: number): { now: number; text: string } {
  const real = Math.round(Math.max(0, used) * 100);
  const now = Math.min(100, real);
  const over = real > 100;
  const base = over ? `${real}% used, over budget` : `${real}% used`;
  const text = pace !== undefined && pace < 1 && !over ? `${base}; an even pace would be ${Math.round(pace * 100)}%` : base;
  return { now, text };
}

/** Praise for being inside the 30% wants guide is only fair once enough of the period has gone. */
export function praiseWants(isCurrent: boolean, dayNow: number, daysTotal: number): boolean {
  return !isCurrent || dayNow / Math.max(1, daysTotal) >= 0.5;
}

/** Where a pay-cycle-less month and a pay cycle say how long they are, without repeating a range the navigator already shows. */
export function periodSubtitle(opts: { account?: string; cycle: boolean; isCurrent: boolean; dayNow: number; daysTotal: number }): string {
  const tail = opts.isCurrent ? `day ${opts.dayNow} of ${opts.daysTotal}` : `${opts.daysTotal} days, complete`;
  return `${opts.account ? `${opts.account} · ` : ""}${opts.cycle ? "Pay cycle" : "Calendar month"} · ${tail}`;
}
