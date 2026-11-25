/** Pure decisions behind the Filter sheet (no React, so they are tested in plain Node). */

export type DatePreset = { label: string; from: string; to: string };

/**
 * Which date chip is chosen: "month" (no range: the month on screen), one of the quick ranges (its label), or "custom"
 * (a range that no quick range makes, or when the person asked to type dates). Colour is never the only sign of it: the
 * chosen chip is also checked and heavier.
 */
export function activeDateChoice(from: string, to: string, presets: DatePreset[], custom: boolean): "month" | "custom" | string {
  if (custom) return "custom";
  if (!from && !to) return "month";
  const hit = presets.find((p) => p.from === from && p.to === to);
  return hit ? hit.label : "custom";
}

/** How many of the sheet's own filters are on (the badge on the Filter button). The account and the search are not the sheet's. */
/**
 * The day on screen, when the list is that whole day: it starts and ends on one day, shows everything or spending only,
 * and nothing else narrows it. Only then does the daily-limit figure, which is for the whole book, describe the list.
 * Otherwise null.
 */
export function wholeDayShown(
  filters: { from?: string | null; to?: string | null },
  raw: { type: string; account: string; category: string; q: string; min: string; max: string },
): string | null {
  if (!filters.from || filters.from !== filters.to) return null;
  if (raw.type !== "" && raw.type !== "expense") return null;
  return raw.account || raw.category || raw.q.trim() || raw.min || raw.max ? null : filters.from;
}

export function appliedCount(o: { type: boolean; category: boolean; range: boolean; amount: boolean; sort: boolean }): number {
  return [o.type, o.category, o.range, o.amount, o.sort].filter(Boolean).length;
}

/** The words for the Type filter in the pill and the sheet. */
export const TYPE_CHOICES = [
  ["", "All"],
  ["expense", "Spending"],
  ["income", "Income"],
  ["transfer", "Transfer"],
] as const;

export function typeText(type: string): string | null {
  return TYPE_CHOICES.find(([v]) => v === type && v !== "")?.[1] ?? null;
}

/** "1,234.50" for an amount in sen: the page says "amounts in RM" once, so a row doesn't repeat it. */
export function bareRM(formatted: string): string {
  return formatted.replace(/^[^\d-]+/, "");
}
