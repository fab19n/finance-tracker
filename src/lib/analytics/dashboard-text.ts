import { formatPct, formatRM, formatRMWhole, formatRMWholeBare } from "@/lib/money";
import { dayLabel, shortMonthLabel } from "@/lib/dates";
import type { SpendDay } from "./daily-spend";
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

/** "RM 640 of 700": what was spent against the limit, the way the design writes a budget row. */
export function budgetAmounts(spent: number, budget: number): string {
  return `${formatRMWhole(spent)} of ${formatRMWholeBare(budget)}`;
}

/**
 * The one extra fact a budget row can carry under its bar (nothing when all is simply well): over by how much, the pace it
 * is on, bills still due, or that the bills are paid. Null means no pill.
 */
export function budgetNote(b: Pick<BudgetRow, "status" | "settled" | "spent" | "budget" | "projected" | "billsDue">): string | null {
  if (b.status === "over") return `Over budget by ${formatRM(b.spent - b.budget)}`;
  if (b.settled) return "Bills paid: nothing more due";
  if (b.status === "watch") return `On pace to reach ${formatRM(b.projected)}`;
  if (b.billsDue > 0) return `On track · ${formatRM(b.billsDue)} in bills still due`;
  return null;
}

/** "12 days to payday" / "Payday due" (the expected day has come and no salary is recorded) / "3 days left this month". */
export function daysLeftText(days: number, mode: "payday" | "month", overdue = false): string {
  if (overdue) return "Payday due";
  return `${days} ${days === 1 ? "day" : "days"} ${mode === "payday" ? "to payday" : "left this month"}`;
}

/**
 * What a day's square says, as its tooltip and the start of its accessible name. The square itself shows only a colour, so
 * this is where the words are: the date, the amount judged, where that stands against the limit, and any bills left out.
 */
export function daySquareText(d: Pick<SpendDay, "date" | "spent" | "bills" | "level" | "future">, limit: number): string {
  if (d.future) return `${dayLabel(d.date)}: not here yet`;
  const state =
    d.level === "over"
      ? `${formatRM(d.spent)} spent, over the limit by ${formatRM(d.spent - limit)}`
      : d.level === 0
        ? "nothing counted"
        : d.spent === limit
          ? `${formatRM(d.spent)} spent, exactly the limit`
          : `${formatRM(d.spent)} spent, within the limit`;
  const bills = d.bills > 0 ? `, plus ${formatRM(d.bills)} in bills (not counted)` : "";
  return `${dayLabel(d.date)}: ${state}${bills}`;
}

/** The caption under the Left to spend figure: a daily allowance, or the plain fact that nothing is left. */
export function leftToSpendCaption(safe: number, perDay: number | null, days: number, overdue = false): string {
  if (safe < 0) return overdue ? "Nothing left until payday" : `Nothing left for the next ${days} ${days === 1 ? "day" : "days"}`;
  if (overdue || perDay === null || days <= 0) return "after the bills still to pay";
  return `${formatRM(perDay)} a day for the next ${days} ${days === 1 ? "day" : "days"}`;
}

/** The warning between the hero and the controls: the budget that is furthest over, and how long until payday. */
export function overBudgetBanner(b: Pick<BudgetRow, "name" | "spent" | "budget">, daysLeft: number | null, overdue = false): string {
  const tail = overdue ? " and payday is due" : daysLeft === null ? "" : ` with ${daysLeft} ${daysLeft === 1 ? "day" : "days"} to payday`;
  return `${b.name} is ${formatRM(b.spent - b.budget)} over its budget${tail}.`;
}

/** Font size classes for a big figure: a long amount steps down so it never clips (375 px phones, two tiles to a row). */
export function kpiSizeClass(value: string): string {
  if (value.length > 11) return "text-[13px] md:text-lg";
  if (value.length > 9) return "text-[15px] md:text-xl";
  return "text-[17px] md:text-2xl";
}

/** The hero figure: 38 px on a phone (34 on desktop) while it fits, smaller as it grows. */
export function heroSizeClass(value: string): string {
  if (value.length > 11) return "text-[26px] md:text-[24px]";
  if (value.length > 9) return "text-[32px] md:text-[28px]";
  return "text-[38px] md:text-[34px]";
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
