import { describe, expect, it } from "vitest";
import * as lib from "../scripts/e2e/lib.mjs";

const L = lib as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("parseArgs", () => {
  it("reads base, browser, pages and the warn-only flag, skipping the pnpm `--`", () => {
    expect(L.parseArgs(["--", "--base", "http://127.0.0.1:3210", "--pages", "a,b", "--warn-only", "--browser", "C:\\x\\msedge.exe"])).toEqual({
      base: "http://127.0.0.1:3210",
      browser: "C:\\x\\msedge.exe",
      pages: "a,b",
      warnOnly: true,
      help: false,
    });
  });
  it("accepts --name=value", () => {
    expect(L.parseArgs(["--base=http://h:1", "--pages=plan"]).base).toBe("http://h:1");
    expect(L.parseArgs(["--pages=plan"]).pages).toBe("plan");
  });
  it("rejects unknown options and missing values", () => {
    expect(() => L.parseArgs(["--nope"])).toThrow(/Unknown/);
    expect(() => L.parseArgs(["--base"])).toThrow(/needs a value/);
    expect(() => L.parseArgs(["--base", "--warn-only"])).toThrow(/needs a value/);
  });
  it("defaults", () => {
    expect(L.parseArgs([])).toEqual({ base: null, browser: null, pages: null, warnOnly: false, help: false });
    expect(L.parseArgs(["-h"]).help).toBe(true);
  });
});

describe("normaliseBase / parsePages", () => {
  it("normalises to an origin", () => {
    expect(L.normaliseBase("http://127.0.0.1:3210/")).toBe("http://127.0.0.1:3210");
    expect(L.normaliseBase("http://127.0.0.1:3210/plan?x=1")).toBe("http://127.0.0.1:3210");
  });
  it("refuses a missing, malformed or non-http base", () => {
    expect(() => L.normaliseBase(null)).toThrow(/required/);
    expect(() => L.normaliseBase("nonsense")).toThrow(/not a URL/);
    expect(() => L.normaliseBase("ftp://x")).toThrow(/http/);
  });
  it("adds leading slashes, drops blanks, and defaults to the full list", () => {
    expect(L.parsePages("plan, /settings,,")).toEqual(["/plan", "/settings"]);
    expect(L.parsePages(null)).toEqual(L.DEFAULT_PAGES);
    expect(L.parsePages(null)).not.toBe(L.DEFAULT_PAGES);
    expect(() => L.parsePages(" , ")).toThrow(/empty/);
  });
  it("the default list covers the pages and every settings tab", () => {
    for (const p of ["/", "/dashboard", "/transactions", "/accounts", "/accounts/1", "/plan", "/plan/bills", "/plan/shared", "/insights", "/invest", "/settings", "/import", "/more"]) {
      expect(L.DEFAULT_PAGES).toContain(p);
    }
    for (const t of ["categories", "payday", "investing", "data"]) expect(L.DEFAULT_PAGES).toContain(`/settings?tab=${t}`);
  });
  it("tests mobile and desktop in light and dark", () => {
    expect(L.VIEWPORTS.map((v: { width: number; height: number }) => [v.width, v.height])).toEqual([[390, 844], [1280, 900]]);
    expect(L.THEMES).toEqual(["light", "dark"]);
  });
});

describe("browser lookup", () => {
  it("lists Edge before Chrome under each Windows root", () => {
    const c: string[] = L.browserCandidates({ ProgramFiles: "C:\\PF", "ProgramFiles(x86)": "C:\\PF86", LOCALAPPDATA: "C:\\L" }, "win32");
    expect(c[0]).toBe("C:\\PF\\Microsoft\\Edge\\Application\\msedge.exe");
    expect(c.findIndex((p) => p.includes("msedge"))).toBeLessThan(c.findIndex((p) => p.includes("chrome.exe")));
    expect(c).toHaveLength(6);
  });
  it("skips unset roots", () => {
    expect(L.browserCandidates({}, "win32")).toEqual([]);
    expect(L.browserCandidates({ ProgramFiles: "C:\\PF" }, "win32")).toHaveLength(2);
  });
  it("has mac paths and nothing guessed on linux", () => {
    expect(L.browserCandidates({}, "darwin")[0]).toContain("Edge");
    expect(L.browserCandidates({}, "linux")).toEqual([]);
  });
  it("pickBrowser returns the first that exists", () => {
    expect(L.pickBrowser(["a", "b", "c"], (p: string) => p !== "a")).toBe("b");
    expect(L.pickBrowser(["a", null], () => false)).toBeNull();
  });
});

describe("parseColor", () => {
  it("reads rgb, rgba, space syntax, percentages and hex", () => {
    expect(L.parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(L.parseColor("rgba(10,20,30,0.5)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(L.parseColor("rgb(10 20 30 / 25%)")).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
    expect(L.parseColor("rgb(100%, 0%, 50%)")).toEqual({ r: 255, g: 0, b: 127.5, a: 1 });
    expect(L.parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(L.parseColor("#2b2b2e")).toEqual({ r: 43, g: 43, b: 46, a: 1 });
    expect(L.parseColor("transparent").a).toBe(0);
  });
  it("returns null for what it cannot read", () => {
    for (const bad of ["", "red", "color(srgb 1 0 0)", "rgb(1,2)", "rgb(a,b,c)", null, undefined, 4]) expect(L.parseColor(bad)).toBeNull();
  });
  it("clamps out-of-range channels", () => {
    expect(L.parseColor("rgb(300, -5, 0)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });
});

describe("contrast", () => {
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  it("is 21 for black on white, 1 for the same colour, and symmetric", () => {
    expect(L.contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(L.contrastRatio(white, white)).toBeCloseTo(1, 5);
    expect(L.contrastRatio(white, black)).toBeCloseTo(L.contrastRatio(black, white), 8);
  });
  it("matches known values (#767676 on white is 4.54:1)", () => {
    expect(L.contrastRatio({ r: 0x76, g: 0x76, b: 0x76, a: 1 }, white)).toBeCloseTo(4.54, 2);
    expect(L.contrastRatio({ r: 0x77, g: 0x77, b: 0x77, a: 1 }, white)).toBeLessThan(4.5);
  });
  it("luminance of the primaries", () => {
    expect(L.luminance(black)).toBe(0);
    expect(L.luminance(white)).toBeCloseTo(1, 8);
    expect(L.luminance({ r: 255, g: 0, b: 0 })).toBeCloseTo(0.2126, 4);
  });
  it("blends translucent colours over a background", () => {
    expect(L.blend({ r: 0, g: 0, b: 0, a: 0.5 }, white)).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
  });
  it("flattens a stack nearest-first: an opaque layer wins, translucent ones tint what is behind", () => {
    expect(L.flattenBackground(["rgb(20, 20, 20)", "rgb(255, 255, 255)"])).toEqual({ r: 20, g: 20, b: 20, a: 1 });
    expect(L.flattenBackground(["rgba(0, 0, 0, 0)", "rgb(10, 10, 10)"])).toEqual({ r: 10, g: 10, b: 10, a: 1 });
    const tinted = L.flattenBackground(["rgba(0, 0, 0, 0.5)", "rgb(255, 255, 255)"]);
    expect(tinted.r).toBeCloseTo(127.5);
    expect(L.flattenBackground([])).toEqual(white);
    expect(L.flattenBackground(["rgba(0, 0, 0, 0.5)"], { r: 100, g: 100, b: 100, a: 1 }).r).toBeCloseTo(50);
  });
  it("large text needs only 3:1", () => {
    expect(L.isLargeText(24, "400")).toBe(true);
    expect(L.isLargeText(19, "700")).toBe(true);
    expect(L.isLargeText(19, "400")).toBe(false);
    expect(L.isLargeText(16, "700")).toBe(false);
    expect(L.isLargeText(18.66, "bold")).toBe(false); // computed weights are numbers; an unknown word counts as 400
  });
  it("evaluateContrast passes and fails by the right threshold", () => {
    const grey = "rgb(150, 150, 150)"; // about 2.9:1 on white
    const base = { layers: ["rgb(255, 255, 255)"], fontSize: 14, fontWeight: "400" };
    expect(L.evaluateContrast({ ...base, color: "rgb(0, 0, 0)" }).ok).toBe(true);
    const bad = L.evaluateContrast({ ...base, color: grey });
    expect(bad.ok).toBe(false);
    expect(bad.required).toBe(4.5);
    const big = L.evaluateContrast({ ...base, color: "rgb(118, 118, 118)", fontSize: 28 });
    expect(big.required).toBe(3);
    expect(big.ok).toBe(true);
    expect(L.evaluateContrast({ ...base, color: "oklch(0.5 0.1 200)" })).toBeNull();
  });
  it("a translucent text colour is blended before it is judged", () => {
    const r = L.evaluateContrast({ color: "rgba(0, 0, 0, 0.5)", layers: ["rgb(255, 255, 255)"], fontSize: 14, fontWeight: "400" });
    expect(r.ratio).toBeCloseTo(L.contrastRatio({ r: 127.5, g: 127.5, b: 127.5, a: 1 }, { r: 255, g: 255, b: 255, a: 1 }), 5);
  });
  it("judges light text on a dark card", () => {
    const r = L.evaluateContrast({ color: "rgb(240, 240, 235)", layers: ["rgba(0,0,0,0)", "rgb(20, 28, 24)"], fontSize: 13, fontWeight: "500" });
    expect(r.ok).toBe(true);
  });
});

describe("accessibleName", () => {
  it("prefers aria-labelledby, then aria-label, then labels, alt, value, text, title, placeholder", () => {
    expect(L.accessibleName({ labelledBy: [" Save ", "entry"], ariaLabel: "x", text: "y" })).toBe("Save entry");
    expect(L.accessibleName({ ariaLabel: "Close", text: "x" })).toBe("Close");
    expect(L.accessibleName({ labels: ["Amount"], text: "" })).toBe("Amount");
    expect(L.accessibleName({ alt: "Logo" })).toBe("Logo");
    expect(L.accessibleName({ tag: "input", type: "submit", value: "Go" })).toBe("Go");
    expect(L.accessibleName({ text: "  Add \n expense " })).toBe("Add expense");
    expect(L.accessibleName({ title: "Help" })).toBe("Help");
    expect(L.accessibleName({ placeholder: "Search" })).toBe("Search");
  });
  it("is empty for an icon-only button with nothing", () => {
    expect(L.accessibleName({ tag: "button", text: "   ", ariaLabel: "", labelledBy: [], labels: [] })).toBe("");
    expect(L.accessibleName({})).toBe("");
    expect(L.accessibleName({ ariaLabel: "  " , labelledBy: ["", "  "] })).toBe("");
  });
  it("does not take a text input's value as its name", () => {
    expect(L.accessibleName({ tag: "input", type: "text", value: "typed" })).toBe("");
  });
});

describe("ids, titles, console", () => {
  it("lists duplicate ids once, ignoring empties", () => {
    expect(L.duplicateIds(["a", "b", "a", "", "", "c", "b", "a"])).toEqual(["a", "b"]);
    expect(L.duplicateIds(["a", "b"])).toEqual([]);
    expect(L.duplicateIds([])).toEqual([]);
  });
  it("a title that is only the app name (or empty) is generic", () => {
    expect(L.isGenericTitle("Koopang")).toBe(true);
    expect(L.isGenericTitle("  koopang ")).toBe(true);
    expect(L.isGenericTitle("")).toBe(true);
    expect(L.isGenericTitle(undefined)).toBe(true);
    expect(L.isGenericTitle("Plan | Koopang")).toBe(false);
    expect(L.isGenericTitle("Koopang", "Other")).toBe(false);
  });
  it("only real console errors fail; a missing favicon does not", () => {
    expect(L.isRealConsoleError({ level: "error", text: "Boom" })).toBe(true);
    expect(L.isRealConsoleError({ level: "warning", text: "Boom" })).toBe(false);
    expect(L.isRealConsoleError({ level: "error", text: "Failed to load resource", url: "http://x/favicon.ico" })).toBe(false);
    expect(L.isRealConsoleError(null)).toBe(false);
  });
});

describe("redirectsToLogin", () => {
  it("is true for a 3xx to /login, absolute or relative, with a query", () => {
    expect(L.redirectsToLogin(307, "/login?next=%2F", "http://h:1")).toBe(true);
    expect(L.redirectsToLogin(302, "http://h:1/login", "http://h:1")).toBe(true);
  });
  it("is false for a 200, a missing location, or another target", () => {
    expect(L.redirectsToLogin(200, "/login", "http://h:1")).toBe(false);
    expect(L.redirectsToLogin(307, null, "http://h:1")).toBe(false);
    expect(L.redirectsToLogin(307, "/dashboard", "http://h:1")).toBe(false);
    expect(L.redirectsToLogin(307, "/loginx", "http://h:1")).toBe(false);
  });
});

describe("focusRingVisible", () => {
  const none = { outlineStyle: "none", outlineWidth: "0px", outlineColor: "rgb(0, 0, 0)", boxShadow: "none", borderColor: "rgb(1, 1, 1)", backgroundColor: "rgb(2, 2, 2)" };
  it("sees a new outline", () => {
    expect(L.focusRingVisible(none, { ...none, outlineStyle: "solid", outlineWidth: "2px" })).toBe(true);
  });
  it("ignores an outline that was already there unchanged", () => {
    const on = { ...none, outlineStyle: "solid", outlineWidth: "2px" };
    expect(L.focusRingVisible(on, on)).toBe(false);
  });
  it("sees a box-shadow ring, a border change or a background change", () => {
    expect(L.focusRingVisible(none, { ...none, boxShadow: "rgb(0, 0, 255) 0px 0px 0px 2px" })).toBe(true);
    expect(L.focusRingVisible(none, { ...none, borderColor: "rgb(9, 9, 9)" })).toBe(true);
    expect(L.focusRingVisible(none, { ...none, backgroundColor: "rgb(9, 9, 9)" })).toBe(true);
  });
  it("is false when nothing changes, or the outline has no width", () => {
    expect(L.focusRingVisible(none, { ...none })).toBe(false);
    expect(L.focusRingVisible(none, { ...none, outlineStyle: "solid", outlineWidth: "0px" })).toBe(false);
  });
});

describe("tables and reports", () => {
  it("truncates and collapses whitespace", () => {
    expect(L.truncate("a   b\n c")).toBe("a b c");
    expect(L.truncate("x".repeat(10), 5)).toBe("xxxx…");
    expect(L.truncate(undefined)).toBe("");
  });
  it("pads columns to the widest cell and underlines the header", () => {
    const t = L.formatTable(["a", "bbb"], [["longer", "x"], ["y", "zz"]]).split("\n");
    expect(t[0]).toBe("a       bbb");
    expect(t[1]).toBe("------  ---");
    expect(t[2]).toBe("longer  x");
    expect(t[3]).toBe("y       zz");
  });
  it("formats an empty table as just its header", () => {
    expect(L.formatTable(["a"], []).split("\n")).toEqual(["a", "-"]);
  });
  const f = (over: object = {}) => ({ page: "/plan", viewport: "mobile", theme: "light", check: "h1", detail: "0 h1 elements", ...over });
  it("merges the same failure seen in several looks and lists where", () => {
    const s = L.summariseFailures([f(), f({ theme: "dark" }), f({ viewport: "desktop" }), f({ check: "ids", detail: "duplicate id a" })]);
    expect(s).toHaveLength(1);
    expect(s[0].rows).toHaveLength(2);
    expect(s[0].rows[0]).toEqual(["h1", "0 h1 elements", "mobile/light mobile/dark desktop/light"]);
  });
  it("groups per page, in first-seen order", () => {
    const s = L.summariseFailures([f({ page: "/b" }), f({ page: "/a" }), f({ page: "/b", check: "x" })]);
    expect(s.map((p: { page: string }) => p.page)).toEqual(["/b", "/a"]);
  });
  it("renders a pass line or a table per page with a count", () => {
    expect(L.renderReport([], 12)).toBe("All 12 checks passed.");
    const r = L.renderReport([f(), f({ page: "/more" })], 40);
    expect(r).toContain("/plan  (1 problem)");
    expect(r).toContain("/more  (1 problem)");
    expect(r).toContain("check");
    expect(r).toContain("2 failures in 40 checks.");
    expect(L.renderReport([f()], 3)).toContain("1 failure in 3 checks.");
  });
  it("exit code is 1 on failures unless warn-only", () => {
    expect(L.exitCode([], false)).toBe(0);
    expect(L.exitCode([f()], false)).toBe(1);
    expect(L.exitCode([f()], true)).toBe(0);
  });
  it("toFailures stamps the context onto each detail", () => {
    expect(L.toFailures({ page: "/p", viewport: "v", theme: "t" }, "names", ["a", "b"])).toEqual([
      { page: "/p", viewport: "v", theme: "t", check: "names", detail: "a" },
      { page: "/p", viewport: "v", theme: "t", check: "names", detail: "b" },
    ]);
    expect(L.toFailures({ page: "/p" }, "names", [])).toEqual([]);
  });
});

describe("hasOutline", () => {
  const base = { outlineStyle: "none", outlineWidth: "0px", outlineColor: "rgb(0, 0, 0)" };
  it("is true for a drawn outline, including a permanent one", () => {
    expect(L.hasOutline({ ...base, outlineStyle: "solid", outlineWidth: "2px" })).toBe(true);
  });
  it("is false for none, zero width, a transparent colour or no style at all", () => {
    expect(L.hasOutline(base)).toBe(false);
    expect(L.hasOutline({ ...base, outlineStyle: "solid", outlineWidth: "0px" })).toBe(false);
    expect(L.hasOutline({ ...base, outlineStyle: "solid", outlineWidth: "2px", outlineColor: "rgba(0, 0, 0, 0)" })).toBe(false);
    expect(L.hasOutline(undefined)).toBe(false);
  });
});
