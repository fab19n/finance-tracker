import { eq, isNotNull, and } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, categories, importRules, recurringBills, transactions } from "@/db/schema";
import { rulePattern } from "./classify";

/**
 * The rules the importer learned from your corrections (`import_rules`), for the manager in Settings. Pure of the clock; reads
 * through the handed database so tests use an in-memory one.
 */
export type LearnedRule = {
  id: number;
  pattern: string;
  kind: "expense" | "income" | "transfer";
  categoryId: number | null;
  categoryName: string | null;
  item: string | null;
  billName: string | null;
  transferAccountName: string | null;
  /** How many imported entries carry a description this rule matches. */
  matched: number;
};

export function listLearnedRules(db: DB): LearnedRule[] {
  const rules = db.select().from(importRules).all();
  if (!rules.length) return [];
  const cats = new Map(db.select({ id: categories.id, name: categories.name }).from(categories).all().map((c) => [c.id, c.name]));
  const accs = new Map(db.select({ id: accounts.id, name: accounts.name }).from(accounts).all().map((a) => [a.id, a.name]));
  const bills = new Map(db.select({ id: recurringBills.id, name: recurringBills.name }).from(recurringBills).all().map((b) => [b.id, b.name]));
  // Entries the importer wrote carry the bank's own wording in `note`; a rule "matches" the ones whose payee is its pattern.
  const seen = new Map<string, number>();
  for (const t of db.select({ note: transactions.note }).from(transactions).where(and(isNotNull(transactions.importKey), isNotNull(transactions.note))).all()) {
    const p = rulePattern(t.note!);
    if (p) seen.set(p, (seen.get(p) ?? 0) + 1);
  }
  return rules
    .map((r) => ({
      id: r.id,
      pattern: r.pattern,
      kind: r.kind,
      categoryId: r.categoryId,
      categoryName: r.categoryId ? (cats.get(r.categoryId) ?? null) : null,
      item: r.item,
      billName: r.billId ? (bills.get(r.billId) ?? null) : null,
      transferAccountName: r.transferAccountId ? (accs.get(r.transferAccountId) ?? null) : null,
      matched: seen.get(r.pattern) ?? 0,
    }))
    .sort((a, b) => a.pattern.localeCompare(b.pattern));
}

/** What a rule does, in a short phrase ("Files it under Groceries", "Treats it as a transfer to Savings"). */
export function describeRule(r: Pick<LearnedRule, "kind" | "categoryName" | "billName" | "transferAccountName">): string {
  if (r.kind === "transfer") return r.transferAccountName ? `A transfer with ${r.transferAccountName}` : "A transfer";
  const what = r.kind === "income" ? "Income" : "Spending";
  const where = r.categoryName ? ` in ${r.categoryName}` : "";
  return `${what}${where}${r.billName ? `, linked to the bill ${r.billName}` : ""}`;
}

export type RuleResult = { ok: true } | { ok: false; error: string };

export function deleteLearnedRule(db: DB, id: number): RuleResult {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "That rule isn't valid." };
  const rule = db.select().from(importRules).where(eq(importRules.id, id)).get();
  if (!rule) return { ok: false, error: "That rule no longer exists." };
  db.delete(importRules).where(eq(importRules.id, id)).run();
  return { ok: true };
}

/** Point a spending or income rule at another category. A transfer rule has none, and the category must be of the rule's own kind. */
export function updateLearnedRuleCategory(db: DB, id: number, categoryId: number): RuleResult {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "That rule isn't valid." };
  const rule = db.select().from(importRules).where(eq(importRules.id, id)).get();
  if (!rule) return { ok: false, error: "That rule no longer exists." };
  if (rule.kind === "transfer") return { ok: false, error: "A transfer rule has no category to change." };
  if (!Number.isInteger(categoryId) || categoryId <= 0) return { ok: false, error: "Choose a category." };
  const cat = db.select().from(categories).where(eq(categories.id, categoryId)).get();
  if (!cat) return { ok: false, error: "That category no longer exists." };
  if (cat.type !== rule.kind) return { ok: false, error: `"${cat.name}" is ${cat.type === "income" ? "an income" : "a spending"} category; this rule is for ${rule.kind === "income" ? "income" : "spending"}.` };
  if (cat.archived) return { ok: false, error: `"${cat.name}" is archived. Restore it first, or pick another.` };
  db.update(importRules).set({ categoryId }).where(eq(importRules.id, id)).run();
  return { ok: true };
}
