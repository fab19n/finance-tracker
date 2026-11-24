import { describe, expect, it } from "vitest";
import { groupByPayee, payeeKey, payeeLabel, takesPayeeDecision, type PayeeLine } from "@/lib/import/payees";

const l = (key: string, group: string, amount: number, o: Partial<PayeeLine> = {}): PayeeLine => ({
  key,
  group,
  description: `DESC ${key}`,
  amount,
  kind: amount < 0 ? "expense" : "income",
  categoryId: 1,
  transferAccountId: null,
  item: "Coffee",
  proposal: { source: "builtin" },
  ...o,
});

describe("groupByPayee", () => {
  it("groups lines of one payee, keeping first-seen order, with the count and the net total", () => {
    const g = groupByPayee([l("a", "starbucks", -1000), l("b", "tesco", -2000), l("c", "starbucks", -500)]);
    expect(g.map((x) => [x.label, x.rows.length, x.total])).toEqual([["Starbucks", 2, -1500], ["Tesco", 1, -2000]]);
  });

  it("keeps money in and money out from one payee apart (a refund is not a purchase)", () => {
    const g = groupByPayee([l("a", "shopee", -1000), l("b", "shopee", 400)]);
    expect(g).toHaveLength(2);
    expect(payeeKey(l("a", "shopee", -1))).not.toBe(payeeKey(l("b", "shopee", 1)));
  });

  it("reports the shared decision, or mixed when the lines differ", () => {
    const same = groupByPayee([l("a", "x", -1), l("b", "x", -2)])[0];
    expect([same.kind, same.categoryId, same.item]).toEqual(["expense", 1, "Coffee"]);
    const diff = groupByPayee([l("a", "x", -1), l("b", "x", -2, { categoryId: 2, item: "Lunch" })])[0];
    expect([diff.categoryId, diff.item]).toEqual(["mixed", "mixed"]);
  });

  it("leaves duplicates, held lines and repairs out of the decision but still lists them", () => {
    const g = groupByPayee([l("a", "x", -1), l("b", "x", -1, { proposal: { source: "duplicate" }, kind: "skip", categoryId: null }), l("c", "x", -1, { fix: { type: "skip" } })])[0];
    expect(g.rows).toHaveLength(3);
    expect(g.editable.map((r) => r.key)).toEqual(["a"]);
    expect(g.categoryId).toBe(1);
    expect(takesPayeeDecision(l("h", "x", -1, { proposal: { source: "hold" } }))).toBe(false);
  });

  it("labels a line with no payee by its own text", () => {
    expect(payeeLabel({ group: "line-7", description: "MBBQR1234 REF" })).toBe("MBBQR1234 REF");
    expect(payeeLabel({ group: "restoran mahbub", description: "x" })).toBe("Restoran Mahbub");
  });
});
