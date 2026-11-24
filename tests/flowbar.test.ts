import { describe, expect, it } from "vitest";
import { flowBarMode } from "@/components/FlowBar";

const base = { narrowed: false, income: 500000, spent: 200000, expectedIncome: 540000 };

describe("flowBarMode", () => {
  it("draws the bar when pay is in and nothing narrows the list", () => {
    expect(flowBarMode(base)).toBe("bar");
  });
  it("hides it for any narrowed list (account, category, search, amount, type)", () => {
    expect(flowBarMode({ ...base, narrowed: true })).toBe("hidden");
  });
  it("says 'no pay' instead of a percentage when income is a few sen of interest", () => {
    expect(flowBarMode({ ...base, income: 11 })).toBe("no-pay");
    expect(flowBarMode({ ...base, income: 0 })).toBe("no-pay");
    expect(flowBarMode({ ...base, income: 2200 })).toBe("no-pay"); // a friend's RM 22 payback
  });
  it("shows nothing when nothing moved", () => {
    expect(flowBarMode({ ...base, income: 0, spent: 0 })).toBe("hidden");
    expect(flowBarMode({ ...base, income: 11, spent: 0 })).toBe("hidden");
  });
  it("keeps the bar for overspending once pay is in", () => {
    expect(flowBarMode({ ...base, spent: 900000 })).toBe("bar");
  });
});
