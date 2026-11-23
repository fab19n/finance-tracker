import { describe, expect, it } from "vitest";
import { bankColor, cardLook, cleanLast4, contrast, markToStored, parseMark, textOn } from "@/lib/card";

describe("bank colours", () => {
  it("knows Maybank, CIMB and Touch 'n Go by name, however they are spelled", () => {
    expect(bankColor("Maybank")).toBe("#b8890f");
    expect(bankColor("Maybank MAE")).toBe("#b8890f");
    expect(bankColor("CIMB Bank")).toBe("#a82129");
    expect(bankColor("Touch 'n Go eWallet")).toBe("#1e58b8");
    expect(bankColor("TnG")).toBe("#1e58b8");
  });
  it("leaves an unknown bank plain", () => {
    expect(bankColor("Hong Leong")).toBeNull();
    expect(cardLook({ name: "Hong Leong", cardColor: null })).toEqual({ bg: null, fg: null });
  });
  it("lets the owner's colour win, and ignores one that is not a hex", () => {
    expect(cardLook({ name: "Maybank", cardColor: "#112233" }).bg).toBe("#112233");
    expect(cardLook({ name: "Maybank", cardColor: "red" }).bg).toBe("#b8890f");
  });
  it("keeps the text readable (4.5:1) on every bank colour and on extremes", () => {
    for (const bg of ["#b8890f", "#a82129", "#1e58b8", "#ffffff", "#000000", "#e0b04a", "#808080"]) {
      expect(contrast(bg, textOn(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the mark in the corner", () => {
  it("round-trips a known network and a named other", () => {
    expect(parseMark("visa")).toEqual({ kind: "network", key: "visa" });
    expect(parseMark("other:Bank Islam")).toEqual({ kind: "other", name: "Bank Islam" });
    expect(markToStored("mastercard", "")).toBe("mastercard");
    expect(markToStored("other", "  Bank Islam  ")).toBe("other:Bank Islam");
  });
  it("is no mark when empty, unknown, or Other without a name", () => {
    expect(parseMark(null)).toBeNull();
    expect(parseMark("")).toBeNull();
    expect(parseMark("diners")).toBeNull();
    expect(parseMark("other:  ")).toBeNull();
    expect(markToStored("other", " ")).toBeNull();
    expect(markToStored("none", "x")).toBeNull();
    expect(markToStored("diners", "")).toBeNull();
  });
  it("cuts a long name", () => {
    expect(markToStored("other", "A very long network name")).toBe("other:A very long ");
  });
});

describe("last four digits", () => {
  it("accepts exactly four digits, ignoring spaces", () => {
    expect(cleanLast4("1234")).toBe("1234");
    expect(cleanLast4(" 12 34 ")).toBe("1234");
  });
  it("rejects anything else", () => {
    for (const v of ["", "123", "12345", "12a4", "••12"]) expect(cleanLast4(v)).toBeNull();
  });
});

describe("how many movements the account page lists", () => {
  it("starts at a first page and ignores junk", async () => {
    const { movementsShown, FIRST } = await import("@/lib/movements");
    for (const v of [undefined, "", "abc", "-5", "3", "2.5", "0"]) expect(movementsShown(v)).toBe(FIRST);
  });
  it("grows with View more but stops at the cap", async () => {
    const { movementsShown, CAP } = await import("@/lib/movements");
    expect(movementsShown("18")).toBe(18);
    expect(movementsShown("100000")).toBe(CAP);
  });
});
