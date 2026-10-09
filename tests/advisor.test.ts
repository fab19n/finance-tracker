import { describe, expect, it } from "vitest";
import { buildAdvice, splitFor, type AdviceInput } from "@/lib/investing/advisor";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const RM = (n: number) => Math.round(n * 100);
const input = (over: Partial<AdviceInput> = {}): AdviceInput => ({
  avgMonthlyIncome: RM(6000),
  avgMonthlyExpense: RM(4000),
  monthsOfData: 3,
  liquid: RM(10_000),
  settings: { ...DEFAULT_SETTINGS },
  ...over,
});
const stepIds = (a: ReturnType<typeof buildAdvice>) => a.steps.map((s) => s.id);

describe("buildAdvice", () => {
  it("asks for data before advising", () => {
    const a = buildAdvice(input({ monthsOfData: 0, avgMonthlyIncome: 0 }));
    expect(a.ready).toBe(false);
    expect(stepIds(a)).toEqual(["need-data"]);
    expect(a.allocation).toBeNull();
  });

  it("with no surplus, says so and does not invent an investment amount", () => {
    const a = buildAdvice(input({ avgMonthlyExpense: RM(6500), liquid: RM(1000) }));
    expect(a.surplus).toBe(0);
    expect(stepIds(a)).toContain("no-surplus");
    expect(a.investableMonthly).toBe(0);
    expect(a.allocation).toBeNull();
  });

  it("puts the emergency fund first and says how long it will take", () => {
    // target = 6 x 4000 = 24,000; have 10,000; gap 14,000; surplus 2,000 -> 7 months
    const a = buildAdvice(input());
    expect(a.emergency).toMatchObject({ target: RM(24_000), gap: RM(14_000), funded: false, monthsToFill: 7 });
    expect(a.emergency.monthsCovered).toBeCloseTo(2.5);
    expect(stepIds(a)).toContain("emergency");
    expect(a.lumpSum).toBe(0); // nothing is "idle" while the safety net is short
  });

  it("when funded, idle cash above the net plus one month becomes a lump sum", () => {
    // target 24,000; liquid 40,000; keep one extra month (4,000) => lump 12,000
    const a = buildAdvice(input({ liquid: RM(40_000) }));
    expect(a.emergency.funded).toBe(true);
    expect(a.lumpSum).toBe(RM(12_000));
    expect(stepIds(a)).toEqual(expect.arrayContaining(["emergency-ok", "lump", "split", "dca"]));
  });

  it("a funded user with no monthly surplus can still get advice on idle cash", () => {
    const a = buildAdvice(input({ avgMonthlyExpense: RM(6500), liquid: RM(80_000) }));
    expect(a.investableMonthly).toBe(0);
    expect(a.lumpSum).toBeGreaterThan(0);
    expect(a.allocation).not.toBeNull();
  });

  it("splits money by risk profile and horizon", () => {
    expect(splitFor("balanced", 2)).toEqual([100, 0]); // under 3 years: no stock-market risk
    expect(splitFor("balanced", 4)).toEqual([50, 50]);
    expect(splitFor("balanced", 10)).toEqual([30, 70]);
    expect(splitFor("conservative", 10)).toEqual([60, 40]);
    expect(splitFor("growth", 10)).toEqual([10, 90]);
    for (const p of ["conservative", "balanced", "growth"] as const)
      for (const h of [1, 4, 12]) expect(splitFor(p, h).reduce((s, x) => s + x, 0)).toBe(100);
  });

  it("allocation adds back up to the money available", () => {
    const a = buildAdvice(input({ liquid: RM(40_000) }));
    const al = a.allocation!;
    expect(al.monthlyFd + al.monthlySp).toBe(a.investableMonthly);
    expect(al.lumpFd + al.lumpSp).toBe(a.lumpSum);
    expect(al.fdPct + al.spPct).toBe(100);
  });

  it("projection is internally consistent", () => {
    const a = buildAdvice(input({ liquid: RM(40_000) }));
    const p = a.projection!;
    const years = DEFAULT_SETTINGS.horizonYears;
    expect(p.series).toHaveLength(years + 1);
    expect(p.final.contributed).toBe(a.lumpSum + a.investableMonthly * 12 * years);
    // 7% S&P beats 3% FD, and a mix lands between the two
    expect(p.final.spExpected).toBeGreaterThan(p.final.fd);
    expect(p.final.mixExpected).toBeGreaterThan(p.final.fd);
    expect(p.final.mixExpected).toBeLessThan(p.final.spExpected);
    expect(p.final.spLow).toBeLessThan(p.final.spExpected);
    expect(p.final.spExpected).toBeLessThan(p.final.spHigh);
    // The last chart point equals the table's expected values
    expect(p.series[years]).toMatchObject({ fd: p.final.fd, sp: p.final.spExpected, mix: p.final.mixExpected });
  });

  it("always carries the not-advice disclaimer", () => {
    expect(buildAdvice(input()).notes.join(" ")).toMatch(/not licensed financial advice/i);
  });
});
