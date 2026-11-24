import { dashboardMonthHref } from "./leakage";

/** Where Insights sends you on Home: the same calendar month it judged, or the pay cycle in progress. */
export function dashboardLinks(today: string): { month: string; cycle: string } {
  return { month: dashboardMonthHref(today.slice(0, 7)), cycle: "/dashboard?view=cycle" };
}
