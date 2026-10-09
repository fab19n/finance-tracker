import { describe, expect, it } from "vitest";
import { xirr } from "@/lib/investing/xirr";

describe("xirr", () => {
  it("one deposit, one year later, +10% -> 10%", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -100_000 },
      { date: "2026-01-01", amount: 110_000 },
    ]);
    expect(r).toBeCloseTo(0.1, 6);
  });
  it("is order-independent", () => {
    const r = xirr([
      { date: "2026-01-01", amount: 110_000 },
      { date: "2025-01-01", amount: -100_000 },
    ]);
    expect(r).toBeCloseTo(0.1, 6);
  });
  it("weights WHEN money went in: a later deposit has less time, so the same gain is a higher rate", () => {
    const early = xirr([
      { date: "2025-01-01", amount: -100_000 },
      { date: "2026-01-01", amount: 105_000 },
    ])!;
    const late = xirr([
      { date: "2025-07-01", amount: -100_000 },
      { date: "2026-01-01", amount: 105_000 },
    ])!;
    expect(late).toBeGreaterThan(early);
  });
  it("handles monthly DCA: steady deposits ending 3% above cost give a modest positive rate", () => {
    const flows = Array.from({ length: 12 }, (_, i) => ({
      date: `2025-${String(i + 1).padStart(2, "0")}-01`,
      amount: -50_000,
    }));
    flows.push({ date: "2026-01-01", amount: 12 * 50_000 * 1.03 });
    const r = xirr(flows)!;
    expect(r).toBeGreaterThan(0.03);
    expect(r).toBeLessThan(0.12);
  });
  it("can be negative for a loss", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -100_000 },
      { date: "2026-01-01", amount: 90_000 },
    ])!;
    expect(r).toBeCloseTo(-0.1, 6);
  });
  it("returns null when it cannot be computed", () => {
    expect(xirr([])).toBeNull();
    expect(xirr([{ date: "2025-01-01", amount: -1000 }])).toBeNull(); // nothing back
    expect(xirr([{ date: "2025-01-01", amount: 1000 }, { date: "2026-01-01", amount: 500 }])).toBeNull(); // nothing in
    expect(xirr([{ date: "2025-01-01", amount: -1000 }, { date: "2025-01-01", amount: 1100 }])).toBeNull(); // same day
  });
});
