import type { FlowRow } from "./summary";
import { median } from "./stats";

export type Cadence = "weekly" | "monthly" | "yearly";

export type Recurring = {
  item: string;
  category: string;
  nature: "need" | "want" | "saving";
  cadence: Cadence;
  /** typical charge (median), sen */
  amount: number;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  /** normalised to a month, sen */
  monthlyCost: number;
  annualCost: number;
  /** first charge vs latest charge as a ratio, e.g. 0.12 = price went up 12% */
  priceChange: number;
  /** still being charged (last charge within ~1.5 billing cycles) */
  active: boolean;
};

const MS_DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / MS_DAY);

const CYCLE_DAYS: Record<Cadence, number> = { weekly: 7, monthly: 30, yearly: 365 };

function cadenceFor(gap: number, n: number, isSubscription: boolean): Cadence | null {
  if (gap >= 5 && gap <= 9 && n >= 4) return "weekly";
  if (gap >= 26 && gap <= 35 && (n >= 3 || (isSubscription && n >= 2))) return "monthly";
  if (gap >= 350 && gap <= 380 && n >= 2) return "yearly";
  return null;
}

/**
 * Find charges that repeat on a schedule with a steady amount: subscriptions, bills, instalments.
 * Detected from behaviour (same item, ~same amount, regular gaps), not from a list of known names.
 */
export function detectRecurring(rows: FlowRow[], today: string): Recurring[] {
  const groups = new Map<string, FlowRow[]>();
  for (const r of rows) {
    if (r.type !== "expense" || !r.item?.trim() || r.isSystem) continue;
    const key = r.item.trim().toLowerCase();
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const out: Recurring[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const sorted = [...g].sort((a, b) => a.date.localeCompare(b.date));
    // Several charges on one day are not a cadence.
    const dates = [...new Set(sorted.map((r) => r.date))];
    if (dates.length < 2) continue;

    const amounts = sorted.map((r) => r.amount);
    const med = median(amounts);
    const stable = amounts.filter((a) => Math.abs(a - med) <= med * 0.12).length / amounts.length >= 0.8;
    if (!stable) continue;

    const gaps = dates.slice(1).map((d, i) => days(dates[i], d));
    const gap = median(gaps);
    const isSub = /subscri|entertain/i.test(sorted[0].categoryName);
    const cadence = cadenceFor(gap, dates.length, isSub);
    if (!cadence) continue;
    const tolerance = Math.max(3, gap * 0.2);
    const regular = gaps.filter((x) => Math.abs(x - gap) <= tolerance).length / gaps.length >= 0.7;
    if (!regular) continue;

    const last = sorted[sorted.length - 1];
    const first = sorted[0];
    const monthlyCost =
      cadence === "monthly" ? med : cadence === "weekly" ? (med * 52) / 12 : med / 12;
    out.push({
      item: last.item!.trim(),
      category: last.categoryName,
      nature: last.nature,
      cadence,
      amount: Math.round(med),
      occurrences: dates.length,
      firstDate: first.date,
      lastDate: last.date,
      monthlyCost: Math.round(monthlyCost),
      annualCost: Math.round(monthlyCost * 12),
      priceChange: first.amount > 0 ? (last.amount - first.amount) / first.amount : 0,
      active: days(last.date, today) <= CYCLE_DAYS[cadence] * 1.5 + 3,
    });
  }
  return out.sort((a, b) => b.monthlyCost - a.monthlyCost);
}
