import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS_TAB, parseSettingsTab, settingsHref, SETTINGS_TABS } from "@/lib/settings-tabs";
import { THEME_COLORS, THEME_KEY, THEME_SCRIPT } from "@/lib/theme";

describe("keeping Settings available offline", () => {
  it("saves every Settings tab for the phone, so the theme control (Data tab) opens without the PC", async () => {
    const { SAVED_PAGES } = await import("@/lib/offline/browser");
    for (const t of SETTINGS_TABS) expect(SAVED_PAGES, t.id).toContain(settingsHref(t.id));
    expect(SAVED_PAGES).toContain("/settings?tab=data");
  });
});

describe("the Settings tabs", () => {
  it("knows its five tabs, and names an unknown one as the default rather than failing", () => {
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual(["accounts", "categories", "payday", "investing", "data"]);
    expect(parseSettingsTab("payday")).toBe("payday");
    expect(parseSettingsTab(["data", "accounts"])).toBe("data"); // ?tab=data&tab=accounts: the first wins
    expect(parseSettingsTab("nope")).toBe(DEFAULT_SETTINGS_TAB);
    expect(parseSettingsTab(undefined)).toBe(DEFAULT_SETTINGS_TAB);
  });

  it("writes an address for a tab: the default tab has no ?tab, so the old /settings links still mean 'accounts'", () => {
    expect(settingsHref("accounts")).toBe("/settings");
    expect(settingsHref("categories")).toBe("/settings?tab=categories");
  });

  it("carries an error to the tab it happened on, with spaces as %20 (not +), as the existing links do", () => {
    expect(settingsHref("accounts", "Account needs a name")).toBe("/settings?error=Account%20needs%20a%20name");
    expect(settingsHref("payday", "Check the numbers")).toBe("/settings?tab=payday&error=Check%20the%20numbers");
  });
});

/** Run the inline script from the root layout's <head> against a stand-in page and storage. */
function runThemeScript(stored: string | null | "throws") {
  const attrs: Record<string, string> = {};
  runInNewContext(THEME_SCRIPT, {
    localStorage: {
      getItem: (key: string) => {
        if (stored === "throws") throw new Error("storage blocked");
        return key === THEME_KEY ? stored : null;
      },
    },
    document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } },
  });
  return attrs;
}

describe("the theme script that runs before first paint", () => {
  it("forces the theme this device chose", () => {
    expect(runThemeScript("dark")).toEqual({ "data-theme": "dark" });
    expect(runThemeScript("light")).toEqual({ "data-theme": "light" });
  });

  it("leaves the OS in charge when nothing (or something unrecognised) is stored", () => {
    expect(runThemeScript(null)).toEqual({});
    expect(runThemeScript("purple")).toEqual({});
  });

  it("stays silent when storage is blocked (a private window): the page must still load", () => {
    expect(runThemeScript("throws")).toEqual({});
  });

  it("uses the page background of each theme as the browser's theme colour", () => {
    expect(THEME_COLORS).toEqual({ light: "#f4f2ee", dark: "#141311" });
  });
});
