import { describe, expect, it } from "vitest";
import { savedMessage } from "@/lib/entry-shape";
import { categoryIconName, dayChoice, largeAmountWarning, nextRadioIndex, quickHints, submitLabel, visibleCategories } from "@/components/entry/entry-logic";

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

describe("categoryIconName: words inside other words", () => {
  it("does not read 'rent' inside 'parents', or 'tax' inside 'taxi'", () => {
    expect(categoryIconName("Parents")).toBe("shared");
    expect(categoryIconName("Taxi")).toBe("car");
    expect(categoryIconName("Road tax")).toBe("plan");
    expect(categoryIconName("Rental")).toBe("home");
  });
  it("puts 'Investment Income' with investments, not cash", () => {
    expect(categoryIconName("Investment Income")).toBe("invest");
    expect(categoryIconName("Income")).toBe("cash");
  });
});

describe("largeAmountWarning", () => {
  it("only speaks up from RM 10,000", () => {
    expect(largeAmountWarning(null)).toBeNull();
    expect(largeAmountWarning(540000)).toBeNull();
    expect(largeAmountWarning(999_999)).toBeNull();
    expect(norm(largeAmountWarning(1_000_000)!)).toContain("RM 10,000.00");
  });
});

describe("quickHints", () => {
  const h = (item: string, type: "income" | "expense", categoryId: number | null, count = 1) => ({ item, type, categoryId, amount: 500, count });
  it("takes the first six of this type, one per item, in the order given", () => {
    const hints = [h("A", "expense", 1), h("a ", "expense", 1), h("Salary", "income", 2), ...["B", "C", "D", "E", "F", "G"].map((n) => h(n, "expense", 1))];
    expect(quickHints(hints, "expense", [1, 2]).map((x) => x.item)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(quickHints(hints, "income", [1, 2]).map((x) => x.item)).toEqual(["Salary"]);
  });
  it("drops entries whose category can no longer be picked, and offers none for a transfer", () => {
    const hints = [h("Old", "expense", 9), h("Kopi", "expense", 1), h("Loose", "expense", null)];
    expect(quickHints(hints, "expense", [1]).map((x) => x.item)).toEqual(["Kopi", "Loose"]);
    expect(quickHints(hints, "transfer", [1])).toEqual([]);
  });
});

describe("nextRadioIndex", () => {
  it("moves with the arrows and wraps", () => {
    expect(nextRadioIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextRadioIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextRadioIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextRadioIndex("ArrowDown", 1, 3)).toBe(2);
    expect(nextRadioIndex("ArrowUp", 1, 3)).toBe(0);
  });
  it("jumps with Home and End, and ignores other keys", () => {
    expect(nextRadioIndex("Home", 2, 3)).toBe(0);
    expect(nextRadioIndex("End", 0, 3)).toBe(2);
    expect(nextRadioIndex("Enter", 0, 3)).toBeNull();
    expect(nextRadioIndex("ArrowRight", 0, 0)).toBeNull();
  });
});
