import { describe, expect, it } from "vitest";
import { nextOrigin, safeBackPath, sectionOf, withBack } from "@/lib/back";

describe("safeBackPath", () => {
  it("accepts a same-site path with its query", () => {
    expect(safeBackPath("/transactions?month=2026-10&q=teh")).toBe("/transactions?month=2026-10&q=teh");
    expect(safeBackPath("/")).toBe("/");
  });
  it("rejects other hosts, protocol-relative and backslash tricks, control characters and junk", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "evil", "", "  ", "/a\nb", "/a\\b", null, undefined, 42]) {
      expect(safeBackPath(bad)).toBeNull();
    }
    expect(safeBackPath("/" + "x".repeat(700))).toBeNull();
  });
});

describe("withBack", () => {
  it("adds an encoded back path, with ? or & as needed", () => {
    expect(withBack("/transactions/5", "/transactions?month=2026-10")).toBe("/transactions/5?back=%2Ftransactions%3Fmonth%3D2026-10");
    expect(withBack("/x?a=1", "/y")).toBe("/x?a=1&back=%2Fy");
  });
  it("leaves the link alone when the back path is not safe", () => {
    expect(withBack("/transactions/5", "//evil")).toBe("/transactions/5");
  });
});

describe("sectionOf", () => {
  it("names the More-menu sections, including their sub-pages", () => {
    expect(sectionOf("/plan")).toBe("plan");
    expect(sectionOf("/plan/bills")).toBe("plan");
    expect(sectionOf("/settings?tab=payday")).toBe("settings");
    expect(sectionOf("/import")).toBe("import");
  });
  it("is null elsewhere, and a prefix is not a section", () => {
    for (const p of ["/", "/more", "/dashboard", "/accounts/3", "/planning", "/settings-x"]) expect(sectionOf(p)).toBeNull();
  });
});

describe("nextOrigin", () => {
  it("remembers the page you came from when you enter a section", () => {
    expect(nextOrigin("/accounts/3", "/settings")).toEqual({ section: "settings", origin: "/accounts/3" });
    expect(nextOrigin("/dashboard?view=month", "/plan")).toEqual({ section: "plan", origin: "/dashboard?view=month" });
    expect(nextOrigin("/more", "/insights")).toEqual({ section: "insights", origin: "/more" });
  });
  it("keeps the origin while you move between tabs of one section", () => {
    expect(nextOrigin("/plan", "/plan/bills")).toBeNull();
    expect(nextOrigin("/settings", "/settings?tab=payday")).toBeNull();
  });
  it("does nothing on a first load, or for a page with no back link", () => {
    expect(nextOrigin(null, "/plan")).toBeNull();
    expect(nextOrigin("/plan", "/dashboard")).toBeNull();
  });
  it("treats going from one section straight to another as a new origin", () => {
    expect(nextOrigin("/plan", "/import")).toEqual({ section: "import", origin: "/plan" });
  });
});
