import { billPaymentsByPeriod, dailyLeftOutIds, dailySpend, type SpendDay } from "@/lib/analytics/daily-spend";
import { periodsWithin, resolvePeriod } from "@/lib/analytics/periods";
import type { AppSettings } from "@/lib/settings";
import { listFlowRows } from "./analytics";
import { listBills, listSalaries } from "./plan";
import { listCategories } from "./reference";

/**
 * One day as Home's daily calendar judges it, for Activity when it shows just that day. It asks the same pure functions
 * Home does, over the whole pay cycle (or month, as Home opens by default) holding the day, so a bill payment never
 * linked to its bill is recognised there too: `spent` is the figure that shaded the square. A test holds the two equal.
 */
export async function dayAgainstLimit(
  date: string,
  today: string,
  settings: Pick<AppSettings, "dailyLimit" | "paydayDay" | "dailyLeftOutCategories" | "dailyCountedNeeds">,
): Promise<SpendDay> {
  const salaryDates = (await listSalaries()).map((s) => s.date);
  const { view } = resolvePeriod({ today, salaryDates, paydayDay: settings.paydayDay });
  const spans = periodsWithin({ view, today, salaryDates, paydayDay: settings.paydayDay, from: date, to: date });
  const from = spans.reduce((first, p) => (p.start < first ? p.start : first), date);
  const to = spans.reduce((last, p) => (p.end > last ? p.end : last), date);
  const [rows, bills, categories] = await Promise.all([listFlowRows(from, to), listBills(), listCategories(true)]);
  return dailySpend(rows, {
    start: date,
    end: date,
    today,
    limit: settings.dailyLimit,
    bills: billPaymentsByPeriod(bills, spans, rows, today),
    leftOutCategoryIds: dailyLeftOutIds(categories, settings.dailyLeftOutCategories, settings.dailyCountedNeeds),
  }).days[0];
}
