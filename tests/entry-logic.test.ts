import { describe, expect, it } from "vitest";
import { savedMessage } from "@/lib/entry-shape";
import { categoryIconName, dayChoice, submitLabel, visibleCategories } from "@/components/entry/entry-logic";

const norm = (s: string) => s.replace(/\s/g, " ");
const base = { editing: false, correcting: false, anyway: false };

describe("submitLabel", () => {
  it("names the action alone while the amount is empty or unreadable", () => {
    expect(norm(submitLabel({ ...base, type: "expense", sen: null }))).toBe("Add expense");
    expect(norm(submitLabel({ ...base, type: "income", sen: 0 }))).toBe("Add income");
  });
  it("carries the live amount", () => {
    expect(norm(submitLabel({ ...base, type: "expense", sen: 1250 }))).toBe("Add expense · RM 12.50");
    expect(norm(submitLabel({ ...base, type: "income", sen: 540000 }))).toBe("Add income · RM 5,400.00");
    expect(norm(submitLabel({ ...base, type: "transfer", sen: 80000 }))).toBe("Add transfer · RM 800.00");
  });
  it("says anyway while the duplicate warning is up", () => {
    expect(norm(submitLabel({ ...base, type: "expense", sen: 1250, anyway: true }))).toBe("Add expense anyway · RM 12.50");
  });
  it("keeps its own words when editing or correcting an outbox entry", () => {
    expect(norm(submitLabel({ ...base, editing: true, type: "expense", sen: 1250 }))).toBe("Save changes");
    expect(norm(submitLabel({ ...base, correcting: true, type: "expense", sen: 1250 }))).toBe("Save and send · RM 12.50");
  });
});

describe("visibleCategories", () => {
  const cats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  it("shows everything when there is nothing to fold away", () => {
    expect(visibleCategories(cats(6), null, false)).toEqual({ shown: cats(6), foldable: false });
  });
  it("folds to five and expands to all", () => {
    expect(visibleCategories(cats(12), null, false).shown.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
    expect(visibleCategories(cats(12), null, true).shown).toHaveLength(12);
  });
  it("never hides the chosen category", () => {
    const v = visibleCategories(cats(12), 9, false);
    expect(v.shown.map((c) => c.id)).toEqual([1, 2, 3, 4, 9]);
    expect(v.foldable).toBe(true);
  });
});

describe("categoryIconName", () => {
  it("answers only when the name clearly means an icon", () => {
    expect(categoryIconName("Salary")).toBe("cash");
    expect(categoryIconName("Rent")).toBe("home");
    expect(categoryIconName("Bills & Utilities")).toBe("bolt");
    expect(categoryIconName("Subscriptions")).toBe("plan");
    expect(categoryIconName("Investments")).toBe("invest");
    expect(categoryIconName("Reimbursements")).toBe("shared");
  });
  it("gives the everyday spending categories their own pictures", () => {
    const want: Record<string, string> = {
      "Eating Out": "utensils",
      Groceries: "cart",
      "Transport & Fuel": "car",
      Shopping: "bag",
      Health: "heart",
      Entertainment: "film",
      Travel: "plane",
      "Gifts & Donations": "gift",
      Education: "book",
    };
    for (const [name, icon] of Object.entries(want)) expect(categoryIconName(name)).toBe(icon);
  });
  it("leaves a name it cannot read to its initials rather than a wrong picture", () => {
    expect(categoryIconName("Miscellaneous")).toBeNull();
    expect(categoryIconName("Pocket money")).toBeNull();
  });
});

describe("dayChoice", () => {
  it("tells today and yesterday apart, across a month edge", () => {
    expect(dayChoice("2026-11-23", "2026-11-23")).toBe("today");
    expect(dayChoice("2026-11-22", "2026-11-23")).toBe("yesterday");
    expect(dayChoice("2026-02-28", "2026-03-01")).toBe("yesterday");
    expect(dayChoice("2026-11-20", "2026-11-23")).toBeNull();
  });
});

describe("savedMessage", () => {
  it("says what was added, for how much and where", () => {
    expect(norm(savedMessage({ type: "expense", amount: 1250, category: "Eating Out", account: "Cash in Hand" }))).toBe("Added RM 12.50 · Eating Out · Cash in Hand");
    expect(norm(savedMessage({ type: "income", amount: 650000, category: "Salary", account: "Bank" }))).toBe("Added RM 6,500.00 · Salary · Bank");
    expect(norm(savedMessage({ type: "transfer", amount: 20000, account: "Bank", toAccount: "Cash" }))).toBe("Added RM 200.00 · Bank to Cash");
  });
  it("leaves out a name it does not have", () => {
    expect(norm(savedMessage({ type: "expense", amount: 500 }))).toBe("Added RM 5.00");
    expect(norm(savedMessage({ type: "transfer", amount: 500, account: "Bank" }))).toBe("Added RM 5.00");
  });
});
