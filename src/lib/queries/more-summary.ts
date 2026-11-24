import { detectLeaks } from "@/lib/analytics/leakage";
import { monthEnd, monthStart, shiftDays } from "@/lib/dates";
import { asBillTxs, evaluateBills, toBudgetBills } from "@/lib/plan/bills";
import { listFlowRows } from "@/lib/queries/analytics";
import { getCashStatus } from "@/lib/queries/cash";
import { listInvestments } from "@/lib/queries/investments";
import { getPlan } from "@/lib/queries/plan";
import { listCategories } from "@/lib/queries/reference";
import { getSharedBills } from "@/lib/queries/shares";
import { getSettings } from "@/lib/settings";

/** The live figures the More menu prints at the end of a row. A figure that can't be worked out is `null`, and its row simply has none. */
export type MoreSummary = {
  /** Plan: what is left to spend (null until a spending account is chosen). */
  leftToSpend: number | null;
  /** Shared bills: what people owe you (null when nothing is shared). */
  owedToYou: number | null;
  /** Insights: how many findings the page lists. */
  findings: number | null;
  /** Invest: what the portfolio is worth (null when nothing is invested). */
  portfolio: number | null;
};

/** Next's redirect and not-found signals are thrown errors; they must reach Next, never be swallowed as "no figure". */
function isNextSignal(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "DYNAMIC_SERVER_USAGE");
}

async function attempt<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    if (isNextSignal(e)) throw e;
    return null;
  }
}

/**
 * Four figures for the More menu, each worked out the way its own page does it (the same functions), each on its own: one
 * failing leaves the others, and the menu still opens.
 */
export async function getMoreSummary(today: string): Promise<MoreSummary> {
  // The Plan is read ONCE per visit and shared by "left to spend" and the findings (it is the heaviest read here).
  const planOnce = attempt(() => getPlan(today));
  const [leftToSpend, owedToYou, findings, portfolio] = await Promise.all([
    attempt(async () => {
      const plan = await planOnce;
      return plan && plan.safe.configured ? plan.safe.safe : null;
    }),
    attempt(async () => {
      const page = await getSharedBills(today);
      return page.bills.length > 0 ? page.owedToYou : null;
    }),
    attempt(async () => {
      const [rows, categories, settings, cash, plan] = await Promise.all([
        listFlowRows(shiftDays(today, -150), today),
        listCategories(),
        getSettings(),
        getCashStatus(today),
        planOnce,
      ]);
      if (!plan) return null;
      return detectLeaks({
        rows,
        today,
        categories: categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, monthlyBudget: c.monthlyBudget })),
        assumptions: { sp500ReturnPct: settings.sp500ReturnPct, horizonYears: settings.horizonYears },
        cash: { unaccounted90: cash.unaccounted90, withdrawn90: cash.withdrawn90 },
        flows: plan.flows,
        billItems: plan.bills.map((b) => b.bill.name),
        budgetBills: toBudgetBills(
          evaluateBills(
            plan.bills.map((b) => b.bill),
            { start: monthStart(today.slice(0, 7)), end: monthEnd(today.slice(0, 7)) },
            asBillTxs(rows),
            today,
          ),
        ),
      }).length;
    }),
    attempt(async () => {
      const rows = await listInvestments(today);
      return rows.length > 0 ? rows.reduce((s, r) => s + r.value, 0) : null;
    }),
  ]);
  return { leftToSpend, owedToYou, findings, portfolio };
}
