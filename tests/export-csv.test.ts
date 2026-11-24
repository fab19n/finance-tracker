import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DB } from "@/db/open";
import { accounts, transactions } from "@/db/schema";
import { csvCell, csvLine, exportPeriod, neutraliseFormula } from "@/lib/csv";

const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));
vi.mock("next/server", () => ({ connection: async () => {} }));

describe("csv cells", () => {
  it("prefixes text that a spreadsheet would run as a formula", () => {
    for (const s of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\tx", "\rx"]) expect(neutraliseFormula(s)).toBe(`'${s}`);
    expect(neutraliseFormula("Lunch")).toBe("Lunch");
    expect(neutraliseFormula("a=b")).toBe("a=b");
  });
  it("leaves money columns alone but guards text columns", () => {
    expect(csvLine(["2026-10-01", "=HYPERLINK(1)", "Food", "", "12.50", "-5.00", "@x"], [1, 2, 6])).toBe(
      "2026-10-01,'=HYPERLINK(1),Food,,12.50,-5.00,'@x",
    );
  });
  it("still quotes commas, quotes and line breaks", () => {
    expect(csvCell('a,"b"', { text: true })).toBe('"a,""b"""');
    expect(csvCell("=a,b", { text: true })).toBe(`"'=a,b"`);
    expect(csvCell(null)).toBe("");
  });
  it("names the file for a range when one was chosen", () => {
    expect(exportPeriod({ month: "2026-10", range: null })).toBe("2026-10");
    expect(exportPeriod({ month: "all", range: { from: "2026-09-26", to: "2026-10-25" } })).toBe("2026-09-26_to_2026-10-25");
    expect(exportPeriod({ month: "all", range: { from: null, to: "2026-10-25" } })).toBe("start_to_2026-10-25");
  });
});

describe("export route", () => {
  let acc: number;
  beforeEach(async () => {
    const { openDb } = await import("@/db/open");
    h.db = openDb(":memory:");
    acc = h.db.select().from(accounts).all()[0].id;
    h.db.insert(transactions).values({ type: "income", amount: 500, date: "2026-10-05", accountId: acc, item: "=1+1", note: "@evil" }).run();
  });

  it("neutralises text, keeps amounts numeric, is no-store and names a range", async () => {
    const { GET } = await import("@/app/(app)/transactions/export/route");
    const url = new URL("http://localhost/transactions/export?month=all&from=2026-10-01&to=2026-10-31");
    const res = await GET({ nextUrl: url } as never);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toContain("transactions-2026-10-01_to_2026-10-31.csv");
    const body = await res.text();
    expect(body).toContain("'=1+1");
    expect(body).toContain("'@evil");
    expect(body).toContain(",5.00,");
  });
});

describe("backup access without a PIN", () => {
  it("is refused outright with no PIN (a forged Host header proves nothing), and served with one", async () => {
    const { openDb } = await import("@/db/open");
    h.db = openDb(":memory:");
    const { GET } = await import("@/app/(app)/settings/backup/route");
    const prev = process.env.APP_PIN;
    try {
      delete process.env.APP_PIN;
      const denied = await GET();
      expect(denied.status).toBe(403);
      expect(await denied.text()).toContain("APP_PIN");
      process.env.APP_PIN = "246810";
      const ok = await GET();
      expect(ok.status).toBe(200);
      expect(ok.headers.get("cache-control")).toBe("no-store");
    } finally {
      if (prev === undefined) delete process.env.APP_PIN;
      else process.env.APP_PIN = prev;
    }
  });
});
