import { describe, expect, it } from "vitest";
import { ageLabel, listSavedPages, oldestSave, savedPageName, storageLine } from "@/lib/offline/phone";

const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);
const MIN = 60_000;

describe("ageLabel", () => {
  it("says how old a saved copy is in the biggest unit that fits", () => {
    expect(ageLabel(NOW - 20_000, NOW)).toBe("just now");
    expect(ageLabel(NOW - MIN, NOW)).toBe("1 minute ago");
    expect(ageLabel(NOW - 45 * MIN, NOW)).toBe("45 minutes ago");
    expect(ageLabel(NOW - 60 * MIN, NOW)).toBe("1 hour ago");
    expect(ageLabel(NOW - 5 * 60 * MIN, NOW)).toBe("5 hours ago");
    expect(ageLabel(NOW - 49 * 60 * MIN, NOW)).toBe("2 days ago");
  });
  it("never goes negative when the phone's clock moved back", () => {
    expect(ageLabel(NOW + 5 * MIN, NOW)).toBe("just now");
  });
});

describe("savedPageName", () => {
  it("names the app's pages and each Settings tab", () => {
    expect(savedPageName("/dashboard")).toBe("Home");
    expect(savedPageName("/")).toBe("Add");
    expect(savedPageName("/settings")).toBe("Settings");
    expect(savedPageName("/settings?tab=data")).toBe("Settings: Appearance & data");
  });
  it("has no name for the login page, an unknown tab or an address with a query it doesn't know", () => {
    expect(savedPageName("/login")).toBeNull();
    expect(savedPageName("/settings?tab=nope")).toBeNull();
    expect(savedPageName("/transactions?month=2026-01")).toBeNull();
  });
});

describe("listSavedPages", () => {
  it("lists only named pages, in the app's order, once each", () => {
    const list = listSavedPages([
      { key: "/more", savedAt: NOW - MIN },
      { key: "/login", savedAt: NOW },
      { key: "/", savedAt: NOW - 10 * MIN },
      { key: "/settings?tab=data", savedAt: null },
      { key: "/more", savedAt: NOW },
      { key: "/transactions", savedAt: NOW - 5 * MIN },
    ]);
    expect(list.map((p) => p.name)).toEqual(["Add", "Activity", "More", "Settings: Appearance & data"]);
  });
  it("finds the stalest save, ignoring pages with no recorded time", () => {
    const list = listSavedPages([
      { key: "/", savedAt: NOW - 10 * MIN },
      { key: "/plan", savedAt: NOW - 90 * MIN },
      { key: "/more", savedAt: null },
    ]);
    expect(oldestSave(list)).toBe(NOW - 90 * MIN);
    expect(oldestSave([])).toBeNull();
  });
});

describe("storageLine", () => {
  it("offers to protect storage only when the phone says it is not protected", () => {
    expect(storageLine(false).canAsk).toBe(true);
    expect(storageLine(true).canAsk).toBe(false);
    expect(storageLine(null).canAsk).toBe(false);
    expect(storageLine(false).text).toMatch(/not yet sent/);
  });
});
