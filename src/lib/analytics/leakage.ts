import { futureValueMonthly } from "@/lib/investing/projection";
import { formatPct, formatRM } from "@/lib/money";
import { detectRecurring } from "./recurring";
import type { CycleFlow } from "@/lib/plan/savings-flow";
import { mean, stddev, sum } from "./stats";
import {
  budgetProgress,
  daysInMonthOf,
  monthTotals,
  type BudgetCategory,
  type FlowRow,
} from "./summary";

/**
 * The leak detector. Every rule is a plain function over rows: it returns the evidence it saw, how
 * confident it is (severity) and a savings estimate - never a verdict. All thresholds are named
 * constants so the behaviour is easy to read and tune.
 */

export type InsightKind =
  | "category_creep"
  | "small_frequent"
  | "subscriptions"
  | "over_budget"
  | "wants_heavy"
  | "spike"
  | "weekend"
  | "cash_unaccounted"
  | "planning_gap"
  | "savings_drawdown"
  | "savings_spending";

export type Severity = "high" | "medium" | "low";

export type Insight = {
  id: string;
  kind: InsightKind;
  severity: Severity;
  title: string;
  /** What the data shows, one fact per line. */
  evidence: string[];
  suggestion: string;
  /** Estimated saving if acted on; 0 for purely informational findings. */
  monthlySaving: number;
  annualSaving: number;
  /** What `monthlySaving` could grow to if invested for the horizon at the assumed return. */
  investedValue: number;
  href?: string;
};

export type LeakInput = {
  /** Income + expense rows covering at least the last ~4 months, oldest first. */
  rows: FlowRow[];
  today: string; // YYYY-MM-DD
  categories: BudgetCategory[];
  assumptions: { sp500ReturnPct: number; horizonYears: number };
  cash: { unaccounted90: number; withdrawn90: number };
  /** Pay-cycle savings flows, newest first (see plan/savings-flow.ts). Omit when no salary has been recorded. */
  flows?: CycleFlow[];
  /** Names of your recurring bills (rent, Netflix...). They are planned spending, so never a "spike" or a "habit". */
  billItems?: string[];
};

// --- tunable thresholds (sen unless noted) ------------------------------------
const CREEP_RATIO = 1.25; // spend this far above the usual pace
const CREEP_MIN_EXCESS = 5_000; // ...and at least RM 50 above it
const CREEP_MIN_DAY = 5; // too early in the month to compare before this
const CREEP_MIN_COMPARABLE = 0.2; // by-now history must be >=20% of a usual month to be comparable
const FREQUENT_MIN_COUNT = 12; // times in 90 days
const FREQUENT_MAX_AVG = 3_000; // "small" = average under RM 30
const FREQUENT_MIN_TOTAL = 30_000; // ...but at least RM 300 in 90 days
const FREQUENT_CUT = 0.5; // halve it
const FREQUENT_SHOWN = 3; // biggest habits get their own card; the rest are folded into one
const SUBSCRIPTION_CUT = 0.3; // drop roughly a third of them
const WANTS_GUIDE = 0.3; // 50/30/20
const SPIKE_SIGMA = 2.5;
const SPIKE_MIN_EXCESS = 20_000;
const WEEKEND_RATIO = 1.6;
const CASH_MIN = 5_000;
const CASH_CUT = 0.5;
const PLANNING_GAP_MIN = 10_000; // RM 100 a cycle before the payday split is worth flagging
const EVERYDAY_DRAWDOWN_MIN = 10_000;
const EVERYDAY_RECLAIM = 0.3; // a modest tightening, not "stop buying groceries"
const SAVINGS_SPEND_MIN = 30_000; // RM 300 a cycle paid straight out of savings before it is worth saying
const SAVINGS_SPEND_HIGH = 0.25; // ...and "high" once it is a quarter of what you move to savings

const SEV_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const MS_DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / MS_DAY);
const shiftDay = (iso: string, d: number) => new Date(Date.parse(iso) + d * MS_DAY).toISOString().slice(0, 10);
const prevMonths = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (i + 1), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
};
const dayOf = (iso: string) => Number(iso.slice(8, 10));
const monthOf = (iso: string) => iso.slice(0, 7);

export function detectLeaks(input: LeakInput): Insight[] {
  const { rows, today, categories, assumptions, cash } = input;
  const month = monthOf(today);
  const day = dayOf(today);
  const dim = daysInMonthOf(month); // used by the budget rule below
  const expenses = rows.filter((r) => r.type === "expense" && !r.isSystem);

  const money = (monthly: number) => ({
    monthlySaving: Math.max(0, Math.round(monthly)),
    annualSaving: Math.max(0, Math.round(monthly * 12)),
    investedValue: futureValueMonthly(Math.max(0, monthly), assumptions.sp500ReturnPct, assumptions.horizonYears),
  });

  const out: Insight[] = [];
  const recurring = detectRecurring(rows, today);
  const recurringKeys = new Set([...recurring.map((r) => r.item.toLowerCase()), ...(input.billItems ?? []).map((b) => b.trim().toLowerCase())]);

  // Earlier months the data covers from day 1. A month recorded only from the 26th would look like a month in which
  // little was spent, and make this month look like a creep, so a half-recorded month is never a baseline.
  const dataStart = rows.reduce((first, r) => (r.date < first ? r.date : first), today);
  const monthsWithData = prevMonths(month, 3).filter((m) => dataStart <= `${m}-01` && rows.some((r) => monthOf(r.date) === m));

  // 1. Category creep ---------------------------------------------------------
  // Like-for-like: spend in days 1..today vs what you usually spent by this day in earlier months.
  // (Linear extrapolation would call a single rent payment on the 1st "244% above usual".)
  if (day >= CREEP_MIN_DAY && monthsWithData.length >= 2) {
    type Cat = { id: number | null; name: string; icon: string; full: Map<string, number>; toDate: Map<string, number>; now: FlowRow[] };
    const byCat = new Map<string, Cat>();
    for (const r of expenses) {
      const c: Cat = byCat.get(r.categoryName) ?? { id: r.categoryId, name: r.categoryName, icon: r.categoryIcon, full: new Map(), toDate: new Map(), now: [] };
      const m = monthOf(r.date);
      c.full.set(m, (c.full.get(m) ?? 0) + r.amount);
      if (dayOf(r.date) <= day) c.toDate.set(m, (c.toDate.get(m) ?? 0) + r.amount);
      if (m === month) c.now.push(r);
      byCat.set(r.categoryName, c);
    }
    for (const c of byCat.values()) {
      const usualFull = mean(monthsWithData.map((m) => c.full.get(m) ?? 0));
      const usualByNow = mean(monthsWithData.map((m) => c.toDate.get(m) ?? 0));
      const soFar = c.toDate.get(month) ?? 0;
      if (usualFull <= 0 || soFar <= 0) continue;
      const excess = soFar - usualByNow;
      // When history says little is normally spent by now (bills paid later in the month),
      // only speak up if this month has already beaten a whole usual month.
      const comparable = usualByNow >= usualFull * CREEP_MIN_COMPARABLE || soFar > usualFull;
      if (!comparable || soFar < usualByNow * CREEP_RATIO || excess < CREEP_MIN_EXCESS) continue;
      const endsNear = soFar + Math.max(0, usualFull - usualByNow);
      const biggest = c.now.reduce((a, b) => (b.amount > a.amount ? b : a), c.now[0]);
      const ratio = usualByNow > 0 ? soFar / usualByNow : Infinity;
      const href = c.id ? `/transactions?month=${month}&category=${c.id}` : undefined;
      // One or two entries, one of them dominant: a single big purchase, not a habit. Flag it, but don't
      // annualise it into a "saving" - that would multiply a one-off by twelve.
      if (c.now.length <= 2 && biggest.amount >= soFar * 0.7) {
        out.push({
          id: `oneoff-${c.name}`,
          kind: "category_creep",
          severity: excess >= 20_000 ? "medium" : "low",
          title: `${c.icon} One big ${c.name} purchase: ${biggest.item ?? c.name} ${formatRM(biggest.amount)}`,
          evidence: [
            `${formatRM(soFar)} in ${c.name} so far this month; you usually spend ${formatRM(Math.round(usualFull))} in a whole month`,
            "A single large purchase, not a repeating habit",
          ],
          suggestion: "Was it planned? If not, a 24-hour wait rule before big non-essential buys catches most of these.",
          ...money(0),
          href,
        });
        continue;
      }
      out.push({
        id: `creep-${c.name}`,
        kind: "category_creep",
        severity: excess >= 20_000 ? "high" : excess >= 10_000 ? "medium" : "low",
        title:
          ratio === Infinity
            ? `${c.icon} ${c.name} is well above your usual`
            : ratio >= 3
              ? `${c.icon} ${c.name} is ${ratio.toFixed(0)}× your usual pace`
              : `${c.icon} ${c.name} is ${formatPct(ratio - 1)} above your usual pace`,
        evidence: [
          `${formatRM(soFar)} spent in the first ${day} days of the month`,
          `You usually spend ${formatRM(Math.round(usualByNow))} by this point (last ${monthsWithData.length} months)`,
          `Expect the month to end near ${formatRM(Math.round(endsNear))} vs your usual ${formatRM(Math.round(usualFull))}`,
        ],
        suggestion: `Look at this month's ${c.name} entries and decide which were one-offs and which are a new habit.`,
        ...money(excess),
        href,
      });
    }
  }

  // 2. Small but frequent ("latte factor") ------------------------------------
  const since90 = shiftDay(today, -89);
  const items = new Map<string, { item: string; category: string; count: number; total: number }>();
  for (const r of expenses) {
    if (!r.item?.trim() || r.date < since90 || recurringKeys.has(r.item.trim().toLowerCase())) continue;
    const k = r.item.trim().toLowerCase();
    const it = items.get(k) ?? { item: r.item.trim(), category: r.categoryName, count: 0, total: 0 };
    it.count += 1;
    it.total += r.amount;
    items.set(k, it);
  }
  const frequent = [...items.values()]
    .filter((it) => it.count >= FREQUENT_MIN_COUNT && it.total / it.count <= FREQUENT_MAX_AVG && it.total >= FREQUENT_MIN_TOTAL)
    .sort((x, y) => y.total - x.total);
  const card = (it: (typeof frequent)[number]): Insight => {
    const avg = it.total / it.count;
    const monthly = it.total / 3;
    return {
      id: `frequent-${it.item.toLowerCase()}`,
      kind: "small_frequent",
      severity: monthly * 12 >= 200_000 ? "high" : monthly * 12 >= 100_000 ? "medium" : "low",
      title: `${it.item}: ${it.count} times in 90 days`,
      evidence: [
        `${it.count} purchases, averaging ${formatRM(Math.round(avg))} each`,
        `${formatRM(it.total)} in the last 90 days`,
        `That's about ${formatRM(Math.round(monthly * 12))} a year (${it.category})`,
      ],
      suggestion: `Small amounts hide big totals. Halving ${it.item} (make it at home, or skip every other time) saves the figure below.`,
      ...money(monthly * FREQUENT_CUT),
      href: `/transactions?month=all&q=${encodeURIComponent(it.item)}`,
    };
  };
  for (const it of frequent.slice(0, FREQUENT_SHOWN)) out.push(card(it));
  const rest = frequent.slice(FREQUENT_SHOWN);
  if (rest.length) {
    const total = sum(rest.map((r) => r.total));
    out.push({
      id: "frequent-rest",
      kind: "small_frequent",
      severity: "low",
      title: `${rest.length} more small habits add up to ${formatRM(Math.round((total / 3) * 12))} a year`,
      evidence: rest.map((r) => `${r.item}: ${r.count} times, ${formatRM(r.total)} in 90 days`),
      suggestion: "None of these is alarming alone - together they're a quiet slice of your budget.",
      ...money((total / 3) * FREQUENT_CUT),
      href: "/transactions?month=all",
    });
  }

  // 3. Subscriptions & memberships -------------------------------------------
  const subs = recurring.filter((r) => r.nature === "want" && r.active);
  if (subs.length > 0) {
    const monthly = sum(subs.map((s) => s.monthlyCost));
    const raised = subs.filter((s) => s.priceChange >= 0.1);
    out.push({
      id: "subscriptions",
      kind: "subscriptions",
      severity: monthly >= 20_000 ? "high" : monthly >= 8_000 ? "medium" : "low",
      title: `${subs.length} recurring ${subs.length === 1 ? "charge" : "charges"} cost ${formatRM(monthly)} a month`,
      evidence: [
        ...subs.slice(0, 6).map((s) => `${s.item}: ${formatRM(s.amount)} ${s.cadence} (${s.occurrences} charges, last ${s.lastDate})`),
        ...(subs.length > 6 ? [`…and ${subs.length - 6} more`] : []),
        `Together ${formatRM(monthly * 12)} a year`,
        ...raised.map((s) => `${s.item} went up ${formatPct(s.priceChange)} since your first charge`),
      ],
      suggestion: "For each one ask: did I use it this month? Cancelling the ones you don't is the easiest saving there is.",
      ...money(monthly * SUBSCRIPTION_CUT),
      href: "/transactions?month=all&q=" + encodeURIComponent(subs[0].category),
    });
  }

  // 4. Over budget ------------------------------------------------------------
  for (const b of budgetProgress(rows, categories, month, day)) {
    if (b.status === "ok") continue;
    const over = b.status === "over";
    out.push({
      id: `budget-${b.categoryId}`,
      kind: "over_budget",
      severity: over ? "high" : "medium",
      title: over
        ? `${b.icon} ${b.name} is over budget`
        : `${b.icon} ${b.name} is on pace to go over budget`,
      evidence: [
        `${formatRM(b.spent)} spent of a ${formatRM(b.budget)} budget (${formatPct(b.used)})`,
        over ? `Over by ${formatRM(b.spent - b.budget)} with ${dim - day} days left` : `Projected to finish at ${formatRM(b.projected)}`,
      ],
      suggestion: over
        ? "Pause discretionary spending in this category for the rest of the month."
        : "Slow down now and you'll finish inside the budget.",
      ...money(over ? b.spent - b.budget : b.projected - b.budget),
      href: `/transactions?month=${month}&category=${b.categoryId}`,
    });
  }

  // 5. Wants heavier than the 30% guide (last completed month with income) -----
  const [lastMonth] = prevMonths(month, 1);
  const lastIncome = monthTotals(rows, lastMonth).income;
  if (lastIncome > 0) {
    const wants = sum(expenses.filter((r) => monthOf(r.date) === lastMonth && r.nature === "want").map((r) => r.amount));
    const excess = wants - lastIncome * WANTS_GUIDE;
    if (excess > 0) {
      out.push({
        id: "wants-heavy",
        kind: "wants_heavy",
        severity: wants / lastIncome > 0.4 ? "high" : "medium",
        title: `"Wants" took ${formatPct(wants / lastIncome)} of your income last month`,
        evidence: [
          `${formatRM(wants)} on wants out of ${formatRM(lastIncome)} income`,
          `The 50/30/20 guide says about ${formatPct(WANTS_GUIDE)} (${formatRM(Math.round(lastIncome * WANTS_GUIDE))})`,
        ],
        suggestion: "Pick the one or two 'want' categories that gave you the least joy and trim those first.",
        ...money(excess),
        href: `/dashboard?month=${lastMonth}`,
      });
    }
  }

  // 6 & 7. Spike days and weekend pattern (ignore fixed bills so rent day isn't a "spike") ----
  const since60 = shiftDay(today, -59);
  const discretionary = expenses.filter((r) => r.date >= since60 && !(r.item && recurringKeys.has(r.item.trim().toLowerCase())));
  const firstDate = discretionary[0]?.date;
  if (firstDate && daysBetween(firstDate, today) >= 28) {
    const perDay = new Map<string, { total: number; top: { item: string; amount: number } }>();
    for (const r of discretionary) {
      const d = perDay.get(r.date) ?? { total: 0, top: { item: "", amount: 0 } };
      d.total += r.amount;
      if (r.amount > d.top.amount) d.top = { item: r.item ?? r.categoryName, amount: r.amount };
      perDay.set(r.date, d);
    }
    const span = daysBetween(firstDate, today) + 1;
    const series = Array.from({ length: span }, (_, i) => perDay.get(shiftDay(firstDate, i))?.total ?? 0);
    const m = mean(series);
    const sd = stddev(series);
    const spikes = [...perDay.entries()]
      .filter(([, v]) => v.total > m + SPIKE_SIGMA * sd && v.total - m >= SPIKE_MIN_EXCESS)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 3);
    if (spikes.length) {
      out.push({
        id: "spikes",
        kind: "spike",
        severity: "low",
        title: `${spikes.length} unusually expensive ${spikes.length === 1 ? "day" : "days"} lately`,
        evidence: [
          `A normal day is about ${formatRM(Math.round(m))}`,
          ...spikes.map(([date, v]) => `${date}: ${formatRM(v.total)} (biggest: ${v.top.item} ${formatRM(v.top.amount)})`),
        ],
        suggestion: "One-offs are fine - but check these weren't impulse buys you'd skip next time.",
        ...money(0),
      });
    }

    let wkendSum = 0, wkendN = 0, wkdaySum = 0, wkdayN = 0;
    series.forEach((v, i) => {
      const dow = new Date(Date.parse(firstDate) + i * MS_DAY).getUTCDay();
      if (dow === 0 || dow === 6) { wkendSum += v; wkendN++; } else { wkdaySum += v; wkdayN++; }
    });
    if (wkendN >= 6 && wkdayN >= 12 && wkdaySum > 0) {
      const ratio = wkendSum / wkendN / (wkdaySum / wkdayN);
      if (ratio >= WEEKEND_RATIO) {
        out.push({
          id: "weekend",
          kind: "weekend",
          severity: "low",
          title: `Weekends cost you ${ratio.toFixed(1)}x a weekday`,
          evidence: [
            `Average weekend day ${formatRM(Math.round(wkendSum / wkendN))} vs weekday ${formatRM(Math.round(wkdaySum / wkdayN))}`,
            "Based on the last 60 days, excluding regular bills",
          ],
          suggestion: "Plan one low-cost weekend activity a month - the pattern, not any single purchase, is the leak.",
          ...money(0),
        });
      }
    }
  }

  // 9 & 10. Money shuffled back out of savings (needs spending + savings accounts and a recorded salary) -----
  // Looked at over the last completed cycles, so one odd month doesn't set it off.
  const recent = (input.flows ?? []).filter((f) => f.complete && f.income > 0 && f.deposited > 0).slice(0, 3);
  if (recent.length) {
    const avgGap = mean(recent.map((f) => f.planningGap));
    const avgEveryday = mean(recent.map((f) => f.everydayFromSavings));
    const avgDeposit = mean(recent.map((f) => f.deposited));
    const avgDrawn = mean(recent.map((f) => f.drawn));
    const avgLeft = mean(recent.map((f) => f.leftAfterDeposit));
    // Only bills paid out of the spending account count: the ones paid straight from savings never needed a top-up.
    const avgBills = mean(recent.map((f) => f.billsFromSpending));
    const avgDirect = mean(recent.map((f) => f.spentFromSavings));
    const months = `${recent.length} cycle${recent.length === 1 ? "" : "s"}`;

    if (avgGap >= PLANNING_GAP_MIN) {
      out.push({
        id: "planning-gap",
        kind: "planning_gap",
        severity: "medium",
        title: `Your payday transfer leaves ${formatRM(Math.round(avgGap))} too little for your bills`,
        evidence: [
          `On average you move ${formatRM(Math.round(avgDeposit))} to savings and leave ${formatRM(Math.round(avgLeft))} behind`,
          `The bills you pay from that account come to about ${formatRM(Math.round(avgBills))}, so ${formatRM(Math.round(avgGap))} must come back from savings every cycle (average of the last ${months})`,
          `So the "${formatRM(Math.round(avgDeposit))} saved" is really at most ${formatRM(Math.round(avgDeposit - avgGap))}`,
        ],
        suggestion: "Move less at payday - bills plus an everyday allowance stay in your spending account - and stop topping up bill by bill. The Plan page works out the number.",
        // Not money lost - it is a distorted picture of what you really save, so no saving is claimed.
        ...money(0),
        href: "/plan",
      });
    }
    if (avgDirect >= SAVINGS_SPEND_MIN) {
      const top = recent[0].savingsSpendTop.map((t) => `${t.name} ${formatRM(t.amount)}`).join(", ");
      const kept = avgDeposit - avgDrawn - avgDirect;
      out.push({
        id: "savings-spending",
        kind: "savings_spending",
        severity: avgDirect >= avgDeposit * SAVINGS_SPEND_HIGH ? "high" : "medium",
        title: `About ${formatRM(Math.round(avgDirect))} a cycle is paid straight out of your savings account`,
        evidence: [
          `Of the ${formatRM(Math.round(avgDeposit))} you move to savings each cycle, ${formatRM(Math.round(avgDrawn))} comes back as top-ups and ${formatRM(Math.round(avgDirect))} is spent directly from the savings account (average of the last ${months})`,
          top ? `Latest full cycle, biggest: ${top}` : "",
          kept >= 0
            ? `So only about ${formatRM(Math.round(kept))} of the ${formatRM(Math.round(avgDeposit))} you move actually stays there`
            : `So your savings account shrinks by about ${formatRM(Math.round(-kept))} a cycle`,
        ].filter(Boolean),
        suggestion: "Your savings account is acting as a second spending account, so your emergency fund erodes without any single payment looking like a leak. Pay bills and everyday spending from the main account (the Plan page shows how much to keep there) and keep the savings account for savings.",
        // Not money lost: it is spending you were doing anyway, paid from the wrong place, so no saving is claimed.
        ...money(0),
        href: "/plan",
      });
    }
    if (avgEveryday >= EVERYDAY_DRAWDOWN_MIN) {
      out.push({
        id: "savings-drawdown",
        kind: "savings_drawdown",
        severity: avgEveryday >= avgDeposit * 0.25 ? "high" : "medium",
        title: `Everyday spending took about ${formatRM(Math.round(avgEveryday))} a cycle out of your savings`,
        evidence: [
          `Beyond what your payday split forced, you took ${formatRM(Math.round(avgEveryday))} a cycle back out of savings (last ${months})`,
          `That's groceries, fuel, Touch 'n Go, food and small things spent past what was left in your spending account`,
          `Total taken back: ${formatRM(Math.round(avgDrawn))} a cycle of the ${formatRM(Math.round(avgDeposit))} you put in`,
        ],
        suggestion: "Give everyday spending an allowance and watch 'Safe to spend' on the Add screen. Overspending then shows up as a number going red, not as a quiet top-up.",
        // A top-up isn't necessarily a leak (groceries are real), so only the overshoot beyond a sensible allowance is counted.
        ...money(avgEveryday * EVERYDAY_RECLAIM),
        href: "/plan",
      });
    }
  }

  // 8. Cash that vanished -----------------------------------------------------
  if (cash.unaccounted90 >= CASH_MIN) {
    const share = cash.withdrawn90 > 0 ? cash.unaccounted90 / cash.withdrawn90 : 0;
    out.push({
      id: "cash-unaccounted",
      kind: "cash_unaccounted",
      severity: share >= 0.1 || cash.unaccounted90 >= 30_000 ? "high" : "medium",
      title: `${formatRM(cash.unaccounted90)} of cash couldn't be accounted for`,
      evidence: [
        `Over 90 days your cash count came up short by ${formatRM(cash.unaccounted90)}`,
        cash.withdrawn90 > 0 ? `That's ${formatPct(share)} of the ${formatRM(cash.withdrawn90)} you withdrew` : "No ATM withdrawals recorded",
        "This is money you spent but didn't log - the biggest enemy of an accurate picture",
      ],
      suggestion: "Log cash purchases the moment they happen (even on the bus home), and count your cash weekly.",
      ...money((cash.unaccounted90 / 3) * CASH_CUT),
      href: "/insights#cash",
    });
  }

  return out.sort(
    (a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.annualSaving - a.annualSaving,
  );
}

/** Headline: the biggest few findings. They can overlap (a latte also sits inside Eating Out). */
export function headlineSavings(insights: Insight[], n = 3): { monthly: number; annual: number; invested: number } {
  const top = [...insights].sort((a, b) => b.annualSaving - a.annualSaving).slice(0, n);
  return {
    monthly: sum(top.map((i) => i.monthlySaving)),
    annual: sum(top.map((i) => i.annualSaving)),
    invested: sum(top.map((i) => i.investedValue)),
  };
}
