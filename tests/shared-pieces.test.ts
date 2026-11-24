import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/db/open";
import { accounts, categories, transactions } from "@/db/schema";
import { sumTransactions } from "@/lib/queries/transactions";
import { parseTxSearch } from "@/lib/queries/filters";

const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));
vi.mock("next/server", () => ({ connection: async () => {} }));

let ids: { bank: number; cash: number; food: number };

beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  const a = h.db.select().from(accounts).all();
  const c = h.db.select().from(categories).all();
  ids = { bank: a.find((x) => x.type === "bank")!.id, cash: a.find((x) => x.type === "cash")!.id, food: c.find((x) => x.name === "Eating Out")!.id };
  const add = (date: string, amount: number, accountId: number, type: "expense" | "income" | "transfer" = "expense") =>
    h.db.insert(transactions).values({ date, amount, type, accountId, toAccountId: type === "transfer" ? ids.cash : null, categoryId: type === "transfer" ? null : ids.food, item: "x" }).run();
  add("2026-10-02", 1200, ids.bank);
  add("2026-10-09", 5000, ids.bank);
  add("2026-10-20", 700, ids.cash);
  add("2026-10-21", 90000, ids.bank, "income");
  add("2026-10-22", 10000, ids.bank, "transfer");
  add("2026-09-05", 3000, ids.bank);
});

async function count(query: string) {
  const { GET } = await import("@/app/(app)/transactions/count/route");
  const res = await GET(new Request(`http://localhost/transactions/count?${query}`));
  expect(res.headers.get("cache-control")).toBe("no-store");
  return ((await res.json()) as { count: number }).count;
}

describe("GET /transactions/count (the Filter sheet's live count)", () => {
  it("counts exactly what the page lists for the same address", async () => {
    for (const q of ["month=2026-10", "month=all", `month=2026-10&account=${ids.cash}`, "month=2026-10&type=expense", "month=2026-10&min=10&max=50", "from=2026-10-20&to=2026-10-31&month=all", "month=2026-10&sort=largest"]) {
      const view = parseTxSearch(Object.fromEntries(new URLSearchParams(q)));
      expect(await count(q), q).toBe((await sumTransactions(view.filters)).count);
    }
  });
  it("gives the known figures", async () => {
    expect(await count("month=2026-10")).toBe(5);
    expect(await count("month=all")).toBe(6);
    expect(await count("month=2026-10&type=expense")).toBe(3);
    expect(await count("month=2026-10&min=12&max=50")).toBe(2); // RM 12.00 and RM 50.00, both bounds inclusive
  });
  it("reads a reversed range and unreadable amounts the way the page does", async () => {
    expect(await count("month=all&from=2026-10-31&to=2026-10-01")).toBe(5);
    expect(await count("month=2026-10&min=abc")).toBe(5);
  });
});

function loadingFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? loadingFiles(p) : n === "loading.tsx" ? [p] : [];
  });
}

describe("loading skeletons", () => {
  it("every route's loading.tsx shows the page's real title", () => {
    const files = loadingFiles(join(process.cwd(), "src/app"));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Either PageSkeleton with a title, an <h1 className="h-page"> of its own, or (account page) the documented bar stand-in.
      const ok = /<PageSkeleton title="[^"]+"/.test(src) || src.includes('<h1 className="h-page">') || (f.includes("[id]") && !f.includes("transactions") && src.includes("<PageSkeleton />"));
      expect(ok, f).toBe(true);
    }
  });
});
