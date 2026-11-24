import { describe, expect, it } from "vitest";
import { amountError, formatRM, formatRMWhole, parseSen, scaleSen, senToInput } from "@/lib/money";

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

  it.each([
    ["12,50", 1250],
    ["3,5", 350],
    ["RM 12,50", 1250],
    [",5", 50],
    ["1.234,56", 123456],
    ["1,234,56", 123456],
    ["1,234", 123400],
    ["1,234,567", 123456700],
    ["12,500", 1250000],
  ])("reads a comma before one or two digits as decimal: %s -> %d", (input, sen) => {
    expect(parseSen(input)).toBe(sen);
  });
});

describe("amountError", () => {
  it("is null for a readable positive amount", () => {
    expect(amountError("12.50")).toBeNull();
    expect(amountError("12,50")).toBeNull();
    expect(amountError("1,200")).toBeNull();
  });
  it("says what is wrong with more than two decimals", () => {
    expect(amountError("12.345")).toBe("Use at most 2 decimals");
    expect(amountError("RM 0.005")).toBe("Use at most 2 decimals");
    expect(amountError("12,345.678")).toBe("Use at most 2 decimals");
  });
  it("otherwise asks for an amount above zero", () => {
    expect(amountError("")).toBe("Enter an amount greater than 0");
    expect(amountError("abc")).toBe("Enter an amount greater than 0");
    expect(amountError("0")).toBe("Enter an amount greater than 0");
    expect(amountError("1.2.3")).toBe("Enter an amount greater than 0");
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
