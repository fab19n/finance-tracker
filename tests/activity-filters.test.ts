import { describe, expect, it } from "vitest";
import { datePresets, parseTxSearch, qs } from "@/lib/queries/filters";

const parse = (sp: Record<string, string>) => parseTxSearch({ month: "all", ...sp });

describe("the amount filter in the address", () => {
  it("reads ringgit as typed ('100', '12.50', '1,000') into sen", () => {
    expect(parse({ min: "100" }).filters.minAmount).toBe(10_000);
    expect(parse({ max: "12.50" }).filters.maxAmount).toBe(1_250);
    expect(parse({ min: "1,000", max: "RM 2,500.50" }).filters).toMatchObject({ minAmount: 100_000, maxAmount: 250_050 });
  });

  it("ignores what it can't read or what is negative, instead of guessing", () => {
    for (const bad of ["abc", "-5", "12.345", "1e3"]) {
      const v = parse({ min: bad });
      expect(v.filters.minAmount, bad).toBeUndefined();
      expect(v.raw.min, bad).toBe("");
    }
    expect(parse({ min: "", max: "  " }).filters.minAmount).toBeUndefined();
  });

  it("puts a reversed pair the right way round rather than matching nothing", () => {
    const v = parse({ min: "500", max: "100" });
    expect(v.filters).toMatchObject({ minAmount: 10_000, maxAmount: 50_000 });
    expect([v.raw.min, v.raw.max]).toEqual(["100", "500"]);
  });

  it("allows zero (a free item) and keeps the same number in both for an exact match", () => {
    expect(parse({ min: "0" }).filters.minAmount).toBe(0);
    expect(parse({ min: "68", max: "68" }).filters).toMatchObject({ minAmount: 6_800, maxAmount: 6_800 });
  });
});

describe("the order in the address", () => {
  it("accepts the four orders; newest is the default and is not carried", () => {
    expect(parse({ sort: "largest" }).filters.sort).toBe("largest");
    expect(parse({ sort: "smallest" }).raw.sort).toBe("smallest");
    expect(parse({ sort: "oldest" }).filters.sort).toBe("oldest");
    expect(parse({ sort: "newest" }).filters.sort).toBeUndefined();
    expect(parse({ sort: "newest" }).raw.sort).toBe("");
  });

  it("ignores anything else (it never reaches the query)", () => {
    expect(parse({ sort: "amount; drop table transactions" }).filters.sort).toBeUndefined();
    expect(parse({}).filters.sort).toBeUndefined();
  });
});

describe("a date range from the Filter sheet", () => {
  it("beats the month it was set from", () => {
    const v = parseTxSearch({ month: "2026-11", from: "2026-10-05", to: "2026-10-20" });
    expect(v.filters).toMatchObject({ from: "2026-10-05", to: "2026-10-20" });
    expect(v.range).toEqual({ from: "2026-10-05", to: "2026-10-20" });
  });

  it("puts a reversed range the right way round", () => {
    const v = parse({ from: "2026-10-20", to: "2026-10-05" });
    expect(v.range).toEqual({ from: "2026-10-05", to: "2026-10-20" });
    expect([v.raw.from, v.raw.to]).toEqual(["2026-10-05", "2026-10-20"]);
  });

  it("treats empty date boxes (what the form sends) as no range at all", () => {
    expect(parseTxSearch({ month: "2026-10", from: "", to: "" }).range).toBeNull();
    expect(parseTxSearch({ month: "2026-10", from: "", to: "" }).filters.from).toBe("2026-10-01"); // still the month
  });

  it("builds quick ranges that end today", () => {
    const p = datePresets("2026-11-02");
    expect(p.map((x) => [x.label, x.from, x.to])).toEqual([
      ["Last 7 days", "2026-10-27", "2026-11-02"],
      ["Last 30 days", "2026-10-04", "2026-11-02"],
      ["Last 90 days", "2026-08-05", "2026-11-02"],
      ["This year", "2026-01-01", "2026-11-02"],
    ]);
  });
});

describe("everything survives a round trip through a link (so chips, paging and the month navigator keep it)", () => {
  it("keeps amount, order, range and account", () => {
    const first = parse({ min: "100", max: "500", sort: "largest", from: "2026-10-01", to: "2026-10-31", account: "2", type: "expense" });
    const href = qs({ month: first.month, ...first.raw });
    const again = parseTxSearch(Object.fromEntries(new URLSearchParams(href)));
    expect(again.filters).toEqual(first.filters);
    expect(again.range).toEqual(first.range);
  });
});
