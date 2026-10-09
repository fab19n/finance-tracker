import { describe, expect, it } from "vitest";
import { savingsOpportunity } from "@/lib/investing/idle";

const RM = (n: number) => Math.round(n * 100);
const base = { monthlyCosts: RM(3700), targetMonths: 6, savingsRatePct: 0.25, fdRatePct: 3 };

describe("savingsOpportunity", () => {
  it("splits an under-funded emergency fund into 'instant' and 'could earn more', with nothing extra", () => {
    const o = savingsOpportunity({ ...base, balance: RM(20_000) });
    expect(o).toMatchObject({
      goal: RM(22_200), // 6 x 3,700
      funded: false,
      instant: RM(3_700), // one month, always reachable
      parkable: RM(16_300), // the rest of the 20,000, still emergency money
      excess: 0,
      noGain: false,
    });
    expect(o.monthsCovered).toBeCloseTo(5.405, 2);
    expect(o.earnsNow).toBe(RM(50)); // 0.25% of 20,000
    expect(o.extraPerYear).toBe(Math.round(RM(16_300) * 0.0275)); // 2.75 points more on the movable part
  });

  it("money above the goal is 'extra money' (and also counted as able to earn more)", () => {
    const o = savingsOpportunity({ ...base, balance: RM(30_000) });
    expect(o).toMatchObject({ funded: true, instant: RM(3_700), parkable: RM(18_500), excess: RM(7_800) });
    expect(o.extraPerYear).toBe(Math.round(RM(26_300) * 0.0275));
    // the three tiers always add back up to the balance
    expect(o.instant + o.parkable + o.excess).toBe(o.balance);
  });

  it("a balance smaller than one month of costs is all 'instant': nothing to move", () => {
    const o = savingsOpportunity({ ...base, balance: RM(2_000) });
    expect(o).toMatchObject({ instant: RM(2_000), parkable: 0, excess: 0, extraPerYear: 0 });
  });

  it("says there is nothing to gain when the savings account already pays as much as the deposit", () => {
    const o = savingsOpportunity({ ...base, balance: RM(20_000), savingsRatePct: 3.5 });
    expect(o).toMatchObject({ noGain: true, extraPerYear: 0 });
  });

  it("tiers always add up to the balance, across a range of balances", () => {
    for (const b of [0, 1, 1_000, 3_700, 5_000, 22_199, 22_200, 22_201, 100_000]) {
      const o = savingsOpportunity({ ...base, balance: RM(b) });
      expect(o.instant + o.parkable + o.excess).toBe(o.balance);
    }
  });

  it("copes with no known costs yet (no goal, no tiers claimed)", () => {
    const o = savingsOpportunity({ ...base, monthlyCosts: 0, balance: RM(5_000) });
    expect(o).toMatchObject({ goal: 0, funded: false, monthsCovered: 0, instant: 0 });
  });

  it("never reports a negative balance", () => {
    expect(savingsOpportunity({ ...base, balance: -RM(50) }).balance).toBe(0);
  });
});
