import { describe, expect, it } from "vitest";
import { activeDateChoice, appliedCount, bareRM, typeText } from "@/components/activity/filter-logic";
import { formatRM } from "@/lib/money";

const presets = [
  { label: "Last 7 days", from: "2026-11-18", to: "2026-11-24" },
  { label: "Last 30 days", from: "2026-10-26", to: "2026-11-24" },
];

describe("the Filter sheet's date chips", () => {
  it("chooses 'month' with no range, a quick range by its dates, and 'custom' for anything else", () => {
    expect(activeDateChoice("", "", presets, false)).toBe("month");
    expect(activeDateChoice("2026-11-18", "2026-11-24", presets, false)).toBe("Last 7 days");
    expect(activeDateChoice("2026-09-26", "2026-10-25", presets, false)).toBe("custom");
    expect(activeDateChoice("2026-11-18", "", presets, false)).toBe("custom");
  });
  it("shows the date boxes as soon as Custom is asked for, even with nothing typed", () => {
    expect(activeDateChoice("", "", presets, true)).toBe("custom");
    expect(activeDateChoice("2026-11-18", "2026-11-24", presets, true)).toBe("custom");
  });
});

describe("the badge and the words", () => {
  it("counts the sheet's own filters, type included", () => {
    expect(appliedCount({ type: false, category: false, range: false, amount: false, sort: false })).toBe(0);
    expect(appliedCount({ type: true, category: true, range: false, amount: true, sort: false })).toBe(3);
  });
  it("names the type filter and says nothing for All", () => {
    expect(typeText("expense")).toBe("Spending");
    expect(typeText("income")).toBe("Income");
    expect(typeText("")).toBeNull();
    expect(typeText("bogus")).toBeNull();
  });
  it("drops the currency from a row amount whatever space Intl puts after it", () => {
    expect(bareRM(formatRM(120000))).toBe("1,200.00");
    expect(bareRM(formatRM(1250))).toBe("12.50");
  });
});
