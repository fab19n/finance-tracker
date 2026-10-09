import { describe, expect, it } from "vitest";
import { currentCycle, cycleHistory, cycleLabel, normalizeSalaryDates, predictNextPayday } from "@/lib/plan/cycle";

describe("normalizeSalaryDates", () => {
  it("sorts, dedupes, and drops anything within 10 days of the previous payday (a bonus is not a new cycle)", () => {
    expect(normalizeSalaryDates(["2026-09-28", "2026-08-28", "2026-09-28", "2026-09-30", "2026-10-28"])).toEqual([
      "2026-08-28",
      "2026-09-28",
      "2026-10-28",
    ]);
  });
});

describe("predictNextPayday", () => {
  it("uses the usual day of month, in the month after the latest salary", () => {
    expect(predictNextPayday(["2026-08-28", "2026-09-28"], 28)).toBe("2026-10-28");
  });
  it("takes the median of the last three, so one early or late payday doesn't swing the forecast", () => {
    // 31st, 28th, 30th -> median 30
    expect(predictNextPayday(["2026-07-31", "2026-08-28", "2026-09-30"], 28)).toBe("2026-10-30");
  });
  it("clamps to short months: a 31st payday lands on the 28th in February", () => {
    expect(predictNextPayday(["2026-01-31"], 31)).toBe("2026-02-28");
  });
});

describe("currentCycle from recorded salary", () => {
  const salaryDates = ["2026-08-28", "2026-09-28"];
  it("runs from the last payday to the day before the next", () => {
    const c = currentCycle({ today: "2026-10-09", salaryDates, paydayDay: 28 });
    expect(c).toMatchObject({
      start: "2026-09-28",
      end: "2026-10-27",
      nextPayday: "2026-10-28",
      daysLeft: 19,
      daysTotal: 30,
      dayNumber: 12,
      source: "salary",
      paydayOverdue: false,
    });
  });
  it("on payday itself the new cycle starts with a full length", () => {
    const c = currentCycle({ today: "2026-10-28", salaryDates: [...salaryDates, "2026-10-28"], paydayDay: 28 });
    expect(c).toMatchObject({ start: "2026-10-28", dayNumber: 1, nextPayday: "2026-11-28" });
  });
  it("notices when the expected payday has passed with no salary recorded", () => {
    const c = currentCycle({ today: "2026-10-29", salaryDates, paydayDay: 28 });
    expect(c.paydayOverdue).toBe(true);
    expect(c.daysLeft).toBe(0);
  });
});

describe("currentCycle falling back to the payday setting", () => {
  it("works with no salary recorded yet", () => {
    expect(currentCycle({ today: "2026-10-09", salaryDates: [], paydayDay: 28 })).toMatchObject({
      start: "2026-09-28",
      nextPayday: "2026-10-28",
      source: "setting",
      paydayOverdue: false,
    });
    expect(currentCycle({ today: "2026-10-30", salaryDates: [], paydayDay: 28 })).toMatchObject({ start: "2026-10-28", nextPayday: "2026-11-28" });
  });
  it("ignores a salary that is too old to describe the current cycle", () => {
    const c = currentCycle({ today: "2026-10-09", salaryDates: ["2026-06-28"], paydayDay: 28 });
    expect(c.source).toBe("setting");
    expect(c.start).toBe("2026-09-28");
  });
  it("ignores salary dated in the future", () => {
    expect(currentCycle({ today: "2026-10-09", salaryDates: ["2026-10-28"], paydayDay: 28 }).source).toBe("setting");
  });
});

describe("cycleHistory", () => {
  const salaryDates = ["2026-07-28", "2026-08-28", "2026-09-28"];
  it("lists the cycle in progress first, then completed ones, each ending the day before the next payday", () => {
    const h = cycleHistory({ today: "2026-10-09", salaryDates, paydayDay: 28 });
    expect(h.map((c) => [c.start, c.end, c.complete])).toEqual([
      ["2026-09-28", "2026-10-27", false],
      ["2026-08-28", "2026-09-27", true],
      ["2026-07-28", "2026-08-27", true],
    ]);
  });
  it("is empty until a salary has been recorded", () => {
    expect(cycleHistory({ today: "2026-10-09", salaryDates: [], paydayDay: 28 })).toEqual([]);
  });
  it("respects the maximum", () => {
    expect(cycleHistory({ today: "2026-10-09", salaryDates, paydayDay: 28, max: 2 })).toHaveLength(2);
  });
});

describe("cycleLabel", () => {
  it("formats a compact range", () => {
    expect(cycleLabel({ start: "2026-09-28", end: "2026-10-27" })).toBe("28 Sep - 27 Oct");
  });
});
