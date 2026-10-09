import { describe, expect, it } from "vitest";
import { detectRecurring } from "@/lib/analytics/recurring";
import { row } from "./helpers";

const sub = (date: string, rm: number, item = "Netflix") =>
  row({ date, rm, item, cat: "Subscriptions", nature: "want" });

describe("detectRecurring", () => {
  it("finds a monthly subscription from behaviour alone", () => {
    const rows = [sub("2026-07-08", 55.9), sub("2026-08-08", 55.9), sub("2026-09-08", 55.9), sub("2026-10-08", 55.9)];
    const [r] = detectRecurring(rows, "2026-10-09");
    expect(r).toMatchObject({ item: "Netflix", cadence: "monthly", amount: 5590, occurrences: 4, active: true });
    expect(r.monthlyCost).toBe(5590);
    expect(r.annualCost).toBe(5590 * 12);
  });

  it("marks a subscription inactive once it stops being charged", () => {
    const rows = [sub("2026-03-08", 30), sub("2026-04-08", 30), sub("2026-05-08", 30)];
    expect(detectRecurring(rows, "2026-10-09")[0].active).toBe(false);
  });

  it("does not call a varying purchase a subscription", () => {
    const rows = [
      row({ date: "2026-07-05", rm: 25, item: "GrabFood" }),
      row({ date: "2026-08-04", rm: 44, item: "GrabFood" }),
      row({ date: "2026-09-06", rm: 31, item: "GrabFood" }),
      row({ date: "2026-10-05", rm: 58, item: "GrabFood" }),
    ];
    expect(detectRecurring(rows, "2026-10-09")).toEqual([]);
  });

  it("does not call a daily habit recurring", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, rm: 14.5, item: "Starbucks latte" }),
    );
    expect(detectRecurring(rows, "2026-10-01")).toEqual([]);
  });

  it("detects weekly and yearly cadences", () => {
    const weekly = ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"].map((d) =>
      row({ date: d, rm: 60, item: "Petrol", cat: "Fuel" }),
    );
    expect(detectRecurring(weekly, "2026-10-02")[0].cadence).toBe("weekly");

    const yearly = [row({ date: "2025-03-10", rm: 120, item: "Domain renewal" }), row({ date: "2026-03-10", rm: 120, item: "Domain renewal" })];
    const [y] = detectRecurring(yearly, "2026-06-01");
    expect(y.cadence).toBe("yearly");
    expect(y.monthlyCost).toBe(1000);
  });

  it("needs at least two distinct charge dates, and ignores system categories", () => {
    expect(detectRecurring([sub("2026-10-08", 10), sub("2026-10-08", 10)], "2026-10-09")).toEqual([]);
    const sys = [1, 2, 3].map((m) => row({ date: `2026-0${m + 6}-01`, rm: 50, item: "Cash reconciliation", isSystem: true }));
    expect(detectRecurring(sys, "2026-10-01")).toEqual([]);
  });

  it("reports a price rise", () => {
    const rows = [sub("2026-06-08", 50), sub("2026-07-08", 50), sub("2026-08-08", 60), sub("2026-09-08", 60)];
    expect(detectRecurring(rows, "2026-09-20")[0].priceChange).toBeCloseTo(0.2);
  });
});
