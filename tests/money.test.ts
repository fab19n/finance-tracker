import { describe, expect, it } from "vitest";
import { formatRM, formatRMWhole, parseSen, scaleSen, senToInput } from "@/lib/money";

describe("parseSen", () => {
  it.each([
    ["12.50", 1250],
    ["12.5", 1250],
    ["12", 1200],
    ["1,200", 120000],
    ["RM 3.40", 340],
    ["rm3", 300],
    ["0.05", 5],
    [".5", 50],
    ["5.", 500],
    ["  7.25  ", 725],
  ])("parses %s -> %d sen", (input, sen) => {
    expect(parseSen(input)).toBe(sen);
  });

  it.each(["", "   ", "abc", "1.234", "1.2.3", "-5", ".", "RM"])("rejects %j", (input) => {
    expect(parseSen(input)).toBeNull();
  });

  it("is exact where floating point is not", () => {
    expect(parseSen("0.10")! + parseSen("0.20")!).toBe(30);
    expect(parseSen("19.99")).toBe(1999);
    expect(parseSen("1.15")).toBe(115);
  });

  it("handles null and undefined", () => {
    expect(parseSen(null)).toBeNull();
    expect(parseSen(undefined)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats sen as ringgit", () => {
    expect(formatRM(123450)).toContain("1,234.50");
    expect(formatRM(0)).toContain("0.00");
    expect(formatRMWhole(123450)).toContain("1,235");
  });
  it("round-trips through the input format", () => {
    expect(senToInput(1250)).toBe("12.50");
    expect(parseSen(senToInput(99905))).toBe(99905);
  });
  it("scales and rounds to a whole sen", () => {
    expect(scaleSen(1000, 0.333)).toBe(333);
  });
});
