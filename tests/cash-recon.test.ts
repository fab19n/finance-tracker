import { describe, expect, it } from "vitest";
import { reconcileCash } from "@/lib/analytics/cash-recon";

describe("reconcileCash", () => {
  it("matches when the count equals the books", () => {
    expect(reconcileCash(63_329, 63_329)).toEqual({ kind: "match", amount: 0 });
  });
  it("less cash than the books say = unlogged spending (shortfall)", () => {
    expect(reconcileCash(63_329, 18_000)).toEqual({ kind: "shortfall", amount: 45_329 });
  });
  it("more cash than the books say = surplus", () => {
    expect(reconcileCash(10_000, 12_550)).toEqual({ kind: "surplus", amount: 2_550 });
  });
});
