import type { FlowRow } from "@/lib/analytics/summary";

let nextId = 1;
// Each category name gets its own id, as in the real database. "Eating Out" is 1 by convention.
const categoryIds = new Map<string, number>([["Eating Out", 1]]);
function idFor(name: string): number {
  if (!categoryIds.has(name)) categoryIds.set(name, categoryIds.size + 1);
  return categoryIds.get(name)!;
}

/** Terse FlowRow factory for tests. Amounts are given in RM. */
export function row(p: {
  date: string;
  rm: number;
  type?: "income" | "expense";
  cat?: string;
  nature?: "need" | "want" | "saving";
  item?: string | null;
  isSystem?: boolean;
  categoryId?: number;
}): FlowRow {
  return {
    id: nextId++,
    date: p.date,
    type: p.type ?? "expense",
    amount: Math.round(p.rm * 100),
    categoryId: p.categoryId ?? idFor(p.cat ?? "Eating Out"),
    categoryName: p.cat ?? "Eating Out",
    categoryIcon: "•",
    nature: p.nature ?? "want",
    isSystem: p.isSystem ?? false,
    item: p.item === undefined ? null : p.item,
    accountId: 1,
  };
}
