import { describe, expect, it } from "vitest";
import { futureValueLump, futureValueMonthly, projectGrowth } from "@/lib/investing/projection";

describe("projection", () => {
  it("monthly contributions: RM1,000/month at 12% for 1 year = RM12,682.50", () => {
    // r = 1% a month, n = 12 -> 1000 * ((1.01^12 - 1) / 0.01)
    expect(futureValueMonthly(100_000, 12, 1)).toBeCloseTo(1_268_250, -1);
  });
  it("a lump compounds monthly: RM1,000 at 12% for 1 year = RM1,126.83", () => {
    expect(futureValueLump(100_000, 12, 1)).toBeCloseTo(112_683, -1);
  });
  it("0% growth just adds up the deposits", () => {
    expect(futureValueMonthly(50_000, 0, 3)).toBe(50_000 * 36);
    expect(futureValueLump(50_000, 0, 3)).toBe(50_000);
  });
  it("returns 0 for nothing to invest or no time", () => {
    expect(futureValueMonthly(0, 7, 10)).toBe(0);
    expect(futureValueMonthly(1000, 7, 0)).toBe(0);
  });
  it("projectGrowth tracks contributed vs value and starts at today's lump", () => {
    const pts = projectGrowth({ lump: 100_000, monthly: 10_000, ratePct: 6, years: 5 });
    expect(pts).toHaveLength(6);
    expect(pts[0]).toMatchObject({ year: 0, value: 100_000, contributed: 100_000 });
    expect(pts[5].contributed).toBe(100_000 + 10_000 * 60);
    expect(pts[5].value).toBeGreaterThan(pts[5].contributed);
    for (let i = 1; i < pts.length; i++) expect(pts[i].value).toBeGreaterThan(pts[i - 1].value);
  });
});
