/**
 * What a holding is worth on a date when it was last valued some time before: that valuation, plus the money moved in
 * (+) or out (-) since. Without this a contribution made after the last valuation raised "put in" but not "worth", so it
 * showed up as a loss until the worth was updated by hand. Pure.
 */
export type FlowPoint = { date: string; amount: number };

export function valueWithFlowsSince(lastValuation: { date: string; value: number } | null, flows: FlowPoint[], onOrBefore: string, fallbackInvested: number): number {
  if (!lastValuation) return Math.max(0, fallbackInvested);
  const since = flows.filter((f) => f.date > lastValuation.date && f.date <= onOrBefore).reduce((s, f) => s + f.amount, 0);
  return Math.max(0, lastValuation.value + since);
}
