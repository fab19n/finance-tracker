import { describe, expect, it } from "vitest";
import { fdAccruedInterest, fdDaysToMaturity, fdMaturityValue, fdValueOn, type FdTerms } from "@/lib/investing/fd";

const simple: FdTerms = {
  principal: 1_000_000, // RM 10,000
  annualRatePct: 3.65, // 0.01% a day -> RM 1 a day
  startDate: "2026-01-01",
  maturityDate: "2027-01-01",
  compounding: "simple",
};

describe("fixed deposit", () => {
  it("is worth nothing before it opens and the principal on day 0", () => {
    expect(fdValueOn(simple, "2025-12-31")).toBe(0);
    expect(fdValueOn(simple, "2026-01-01")).toBe(1_000_000);
  });
  it("simple interest accrues daily: 182 days at 3.65% = RM182", () => {
    expect(fdValueOn(simple, "2026-07-02")).toBe(1_000_000 + 18_200);
    expect(fdAccruedInterest(simple, "2026-07-02")).toBe(18_200);
  });
  it("stops accruing at maturity", () => {
    expect(fdMaturityValue(simple)).toBe(1_036_500);
    expect(fdValueOn(simple, "2028-06-01")).toBe(1_036_500);
  });
  it("compounding earns a little more than simple over a year", () => {
    const monthly = { ...simple, compounding: "monthly" as const };
    expect(fdMaturityValue(monthly)).toBeGreaterThan(fdMaturityValue(simple));
    // (1 + 0.0365/12)^12 = 1.03712...
    expect(fdMaturityValue(monthly)).toBeCloseTo(1_037_121, -2);
  });
  it("counts days to maturity, negative once matured", () => {
    expect(fdDaysToMaturity(simple, "2026-12-02")).toBe(30);
    expect(fdDaysToMaturity(simple, "2027-01-11")).toBe(-10);
  });
});
