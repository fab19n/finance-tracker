import { shortDate } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import type { BillInCycle } from "./bills";

/**
 * What the Bills tab and the Overview checklist say about a bill. Pure: bills evaluated for the pay cycle in, words and
 * figures out (the page only lays them out).
 */

export type BillTiles = {
  /** What this cycle's bills come to: what was paid plus what is still to find (the same "still to find" the hero holds back). */
  month: number;
  paid: number;
  remaining: number;
  count: number;
  paidCount: number;
  overdueCount: number;
  /** The next unpaid bill with a due date (the soonest one still ahead, else the longest-overdue one). */
  next: { name: string; date: string; overdue: boolean } | null;
};

export function billTiles(items: BillInCycle[], today: string): BillTiles {
  const paid = items.reduce((s, i) => s + (i.paid?.amount ?? 0), 0);
  const remaining = items.reduce((s, i) => s + i.reserve, 0);
  const unpaid = items.filter((i) => i.status !== "paid" && i.dueDate);
  const byDate = (a: BillInCycle, b: BillInCycle) => (a.dueDate as string).localeCompare(b.dueDate as string) || a.bill.name.localeCompare(b.bill.name);
  const ahead = unpaid.filter((i) => (i.dueDate as string) >= today).sort(byDate)[0];
  const late = unpaid.filter((i) => (i.dueDate as string) < today).sort(byDate)[0];
  const pick = ahead ?? late;
  return {
    month: paid + remaining,
    paid,
    remaining,
    count: items.length,
    paidCount: items.filter((i) => i.status === "paid").length,
    overdueCount: items.filter((i) => i.status === "overdue").length,
    next: pick ? { name: pick.bill.name, date: pick.dueDate as string, overdue: !ahead } : null,
  };
}

export type StatusTag = { tone: "good" | "warn" | "danger"; text: string };

/** The tag on a bill's row: Paid (with the day), Overdue, Due soon. Always words, never colour alone. Nothing for a bill that is simply ahead. */
export function billStatusTag(i: Pick<BillInCycle, "status" | "paid" | "daysUntilDue">): StatusTag | null {
  if (i.status === "paid" && i.paid) return { tone: "good", text: `Paid ${shortDate(i.paid.date)}` };
  if (i.status === "overdue" && i.daysUntilDue !== null) {
    const n = -i.daysUntilDue;
    return { tone: "danger", text: `Overdue · ${n} day${n === 1 ? "" : "s"}` };
  }
  if (i.status === "due_soon" && i.daysUntilDue !== null) {
    return { tone: "warn", text: i.daysUntilDue === 0 ? "Due today" : `Due in ${i.daysUntilDue} day${i.daysUntilDue === 1 ? "" : "s"}` };
  }
  return null;
}

/**
 * The line under a bill's name: "Maybank · due 12 Oct", plus its range when the amount varies and "Shared with 3" when
 * people split it. `account` is left out when the page is already showing one account.
 */
export function billCaption(b: { amountMin: number; amountMax: number; dueDay: number | null }, opts: { account?: string | null; dueDate?: string | null; people?: number }): string {
  const parts: string[] = [];
  if (opts.account) parts.push(opts.account);
  parts.push(opts.dueDate ? `due ${shortDate(opts.dueDate)}` : b.dueDay ? `due day ${b.dueDay}` : "no due day");
  if (b.amountMin !== b.amountMax) parts.push(`Range ${formatRM(b.amountMin)} to ${formatRM(b.amountMax)}`);
  if (opts.people && opts.people > 0) parts.push(`Shared with ${opts.people}`);
  return parts.join(" · ");
}
