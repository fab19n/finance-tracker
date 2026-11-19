import { shortMonthLabel } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import type { PersonLedger } from "./shares";

/**
 * The words for a person's standing on a monthly shared bill. Kept out of the component so the page's "who owes you" list
 * and each person's row say the same thing, and so it can be tested.
 */

/** "Sep, Oct, Nov": months by name, with the year on each only when they span more than one year. */
export function monthNames(months: string[]): string {
  const manyYears = new Set(months.map((m) => m.slice(0, 4))).size > 1;
  return months.map((m) => (manyYears ? shortMonthLabel(m) : shortMonthLabel(m).split(" ")[0])).join(", ");
}

/** The charged months they still owe for, a part-paid one marked: "Sep (part), Oct, Nov". Empty when nothing is owed. */
export function owedMonthsText(p: Pick<PersonLedger, "cells">): string {
  const owing = p.cells.filter((c) => c.remaining > 0);
  const manyYears = new Set(owing.map((c) => c.month.slice(0, 4))).size > 1;
  return owing.map((c) => `${manyYears ? shortMonthLabel(c.month) : shortMonthLabel(c.month).split(" ")[0]}${c.state === "partial" ? " (part)" : ""}`).join(", ");
}

/** What is still missing on months not charged yet that they have started paying for. Empty when nothing is. */
export function expectedText(p: Pick<PersonLedger, "upcoming" | "expectedNext">): string {
  const next = p.upcoming.filter((c) => c.remaining > 0);
  if (next.length === 0) return "";
  return next.length === 1 ? `${formatRM(p.expectedNext)} more when ${monthNames([next[0].month])} is charged` : `${formatRM(p.expectedNext)} more expected (${monthNames(next.map((c) => c.month))})`;
}

/** One line that says where this person stands, and how to colour it. */
export function standingText(p: PersonLedger): { text: string; tone: "ok" | "owes" | "ahead" } {
  const expected = expectedText(p);
  if (p.status === "owes") {
    const months = owedMonthsText(p);
    return { text: [`Owes ${formatRM(p.owedNow)}${expected ? " now" : ""}`, months, expected].filter(Boolean).join(" · "), tone: "owes" };
  }
  if (p.status === "ahead") {
    const ahead = p.monthsAhead > 0 ? `Paid ahead ${p.monthsAhead} month${p.monthsAhead === 1 ? "" : "s"}` : "";
    if (expected) return { text: [ahead || "Paid up", expected].join(" · "), tone: "ahead" };
    return { text: ahead || `Credit ${formatRM(p.aheadPaid)}`, tone: "ahead" };
  }
  return { text: "Paid up", tone: "ok" };
}
