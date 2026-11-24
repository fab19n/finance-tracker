import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, categories, importRules, transactions } from "@/db/schema";

const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { deleteImportRule, updateImportRule } from "@/app/actions/import";
import { describeRule, listLearnedRules } from "@/lib/import/rules";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
async function redirected(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m.startsWith("NEXT_REDIRECT:")) return decodeURIComponent(m.slice("NEXT_REDIRECT:".length));
    throw e;
  }
  throw new Error("did not redirect");
}

let acc: number, food: number, groceries: number, salary: number;
let ruleId: number, transferRule: number;
beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  acc = h.db.select().from(accounts).all().find((a) => a.type === "bank")!.id;
  const cats = h.db.select().from(categories).all();
  food = cats.find((c) => c.name === "Eating Out")!.id;
  groceries = cats.find((c) => c.name === "Groceries")!.id;
  salary = cats.find((c) => c.name === "Salary")!.id;
  ruleId = h.db.insert(importRules).values({ pattern: "starbucks", kind: "expense", categoryId: food }).returning().get().id;
  transferRule = h.db.insert(importRules).values({ pattern: "own name", kind: "transfer", transferAccountId: acc }).returning().get().id;
});

describe("listLearnedRules", () => {
  it("names what each rule does and counts the imported entries it matches", () => {
    for (const note of ["STARBUCKS 123", "Starbucks 456", "SOMETHING ELSE"]) {
      h.db.insert(transactions).values({ date: "2026-05-01", type: "expense", amount: 500, accountId: acc, note, importKey: `k-${note}` }).run();
    }
    // Hand-typed entries (no import key) are not "matched".
    h.db.insert(transactions).values({ date: "2026-05-02", type: "expense", amount: 500, accountId: acc, note: "starbucks" }).run();
    const rules = listLearnedRules(h.db);
    const sb = rules.find((r) => r.pattern === "starbucks")!;
    expect(sb).toMatchObject({ kind: "expense", categoryName: "Eating Out", matched: 2 });
    expect(describeRule(sb)).toBe("Spending in Eating Out");
    const tr = rules.find((r) => r.pattern === "own name")!;
    expect(describeRule(tr)).toMatch(/^A transfer with /);
    expect(tr.matched).toBe(0);
  });
});

describe("updateImportRule", () => {
  it("moves the rule to another category of the same kind and goes back to the settings tab", async () => {
    const url = await redirected(updateImportRule(fd({ id: String(ruleId), categoryId: String(groceries) })));
    expect(url).toBe("/settings?tab=data&rule=saved");
    expect(h.db.select().from(importRules).where(eq(importRules.id, ruleId)).get()!.categoryId).toBe(groceries);
  });

  it("refuses an income category for a spending rule, an archived one, an unknown one, and a transfer rule", async () => {
    expect(await redirected(updateImportRule(fd({ id: String(ruleId), categoryId: String(salary) })))).toMatch(/tab=data&error=.*income category/);
    h.db.update(categories).set({ archived: true }).where(eq(categories.id, groceries)).run();
    expect(await redirected(updateImportRule(fd({ id: String(ruleId), categoryId: String(groceries) })))).toMatch(/archived/);
    expect(await redirected(updateImportRule(fd({ id: String(ruleId), categoryId: "99999" })))).toMatch(/no longer exists/);
    expect(await redirected(updateImportRule(fd({ id: String(ruleId), categoryId: "" })))).toMatch(/Choose a category/);
    expect(await redirected(updateImportRule(fd({ id: String(transferRule), categoryId: String(food) })))).toMatch(/no category/);
    expect(h.db.select().from(importRules).where(eq(importRules.id, ruleId)).get()!.categoryId).toBe(food);
  });

  it("says so when the rule was already gone", async () => {
    expect(await redirected(updateImportRule(fd({ id: "999", categoryId: String(food) })))).toMatch(/no longer exists/);
  });
});

describe("deleteImportRule", () => {
  it("forgets the rule and leaves imported entries alone", async () => {
    h.db.insert(transactions).values({ date: "2026-05-01", type: "expense", amount: 500, accountId: acc, categoryId: food, note: "STARBUCKS", importKey: "k1" }).run();
    expect(await redirected(deleteImportRule(fd({ id: String(ruleId) })))).toBe("/settings?tab=data&rule=deleted");
    expect(h.db.select().from(importRules).where(eq(importRules.id, ruleId)).get()).toBeUndefined();
    expect(h.db.select().from(importRules).all()).toHaveLength(1);
    expect(h.db.select().from(transactions).all()).toHaveLength(1);
  });

  it("refuses an unknown or malformed id without deleting anything", async () => {
    expect(await redirected(deleteImportRule(fd({ id: "999" })))).toMatch(/no longer exists/);
    expect(await redirected(deleteImportRule(fd({ id: "abc" })))).toMatch(/isn't valid/);
    expect(h.db.select().from(importRules).all()).toHaveLength(2);
  });
});
