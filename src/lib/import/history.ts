import { and, isNotNull } from "drizzle-orm";
import type { DB } from "@/db/open";
import { transactions } from "@/db/schema";
import { rulePattern, type HistoryRule } from "./classify";

/**
 * What your own books say about a payee. A merchant you have already imported twice or more, always filed under the
 * same category, is recognised the third time without asking: accepting a proposal as it stood never saved a rule
 * (only corrections do), so a payee you were happy with would otherwise be flagged every month.
 *
 * Only imported entries count (hand-typed notes are free text), never transfers, and never lines that belong to a bill
 * or a person sharing one (those are recognised by their own steps). One category, every time: any disagreement means
 * "ask again" rather than "pick the more common".
 */
export const MIN_HISTORY = 2;

export function learnFromHistory(db: DB): HistoryRule[] {
  const rows = db
    .select({ type: transactions.type, note: transactions.note, categoryId: transactions.categoryId, item: transactions.item, billId: transactions.billId, shareId: transactions.shareId })
    .from(transactions)
    .where(and(isNotNull(transactions.importKey), isNotNull(transactions.note)))
    .all();

  // A name you also send TRANSFERS to ("FABIAN A/L LESLIE": your other accounts) says nothing about what a line with that
  // name is: the same text is a transfer one day and a top-up the next. Never learn such a name.
  const sentTransfersTo = new Set<string>();
  for (const r of rows) if (r.type === "transfer") sentTransfersTo.add(rulePattern(r.note!));

  type Bucket = { kind: "expense" | "income"; pattern: string; categories: Set<number>; count: number; items: Map<string, number> };
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    if ((r.type !== "expense" && r.type !== "income") || r.categoryId === null || r.billId !== null || r.shareId !== null) continue;
    const pattern = rulePattern(r.note!);
    if (!pattern || sentTransfersTo.has(pattern)) continue;
    const key = `${r.type}|${pattern}`;
    const b = buckets.get(key) ?? { kind: r.type, pattern, categories: new Set<number>(), count: 0, items: new Map<string, number>() };
    b.categories.add(r.categoryId);
    b.count++;
    if (r.item) b.items.set(r.item, (b.items.get(r.item) ?? 0) + 1);
    buckets.set(key, b);
  }

  const out: HistoryRule[] = [];
  for (const b of buckets.values()) {
    if (b.count < MIN_HISTORY || b.categories.size !== 1) continue;
    const item = [...b.items].sort((a, c) => c[1] - a[1])[0]?.[0] ?? "";
    out.push({ pattern: b.pattern, kind: b.kind, categoryId: [...b.categories][0], item, count: b.count });
  }
  return out;
}
