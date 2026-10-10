import fs from "node:fs";
import path from "node:path";
import { inArray, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DB } from "@/db/open";
import { accounts, categories, holdings, transactions, valuations } from "@/db/schema";

// Swap the Next-specific accessor for a real in-memory database so the actual SQL is exercised.
const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));

let ids: { bank: number; cash: number; ewallet: number; inv: number; food: number; salary: number; sys: number };

beforeAll(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  const accs = h.db.select().from(accounts).all();
  const cats = h.db.select().from(categories).all();
  const inv = h.db.insert(accounts).values({ name: "VOO", type: "investment" }).returning().get();
  h.db.insert(holdings).values({ accountId: inv.id, product: "sp500_etf", ticker: "VOO" }).run();
  ids = {
    bank: accs.find((a) => a.type === "bank")!.id,
    cash: accs.find((a) => a.type === "cash")!.id,
    ewallet: accs.find((a) => a.type === "ewallet")!.id,
    inv: inv.id,
    food: cats.find((c) => c.name === "Eating Out")!.id,
    salary: cats.find((c) => c.name === "Salary")!.id,
    sys: cats.find((c) => c.name === "Unaccounted cash")!.id,
  };
  h.db.update(accounts).set({ openingBalance: 100_000 }).where((await import("drizzle-orm")).eq(accounts.id, ids.bank)).run();

  h.db
    .insert(transactions)
    .values([
      { date: "2026-10-01", type: "income", amount: 500_000, accountId: ids.bank, categoryId: ids.salary, item: "Salary" },
      { date: "2026-10-02", type: "expense", amount: 1_450, accountId: ids.ewallet, categoryId: ids.food, item: "Starbucks latte" },
      { date: "2026-10-03", type: "transfer", amount: 20_000, accountId: ids.bank, toAccountId: ids.cash, note: "ATM" },
      { date: "2026-10-04", type: "expense", amount: 250, accountId: ids.cash, categoryId: ids.food, item: "Teh tarik" },
      { date: "2026-10-05", type: "transfer", amount: 60_000, accountId: ids.bank, toAccountId: ids.inv, note: "DCA" },
      { date: "2026-10-06", type: "expense", amount: 5_000, accountId: ids.cash, categoryId: ids.sys, item: "Cash reconciliation" },
    ])
    .run();
});

describe("account balances come from the ledger", () => {
  it("opening + income - expense, with transfers moving money rather than creating or losing it", async () => {
    const { getAccountBalances } = await import("@/lib/queries/accounts");
    const b = Object.fromEntries((await getAccountBalances()).map((a) => [a.id, a]));
    // bank: 1,000 opening + 5,000 salary - 200 ATM - 600 to investment
    expect(b[ids.bank].balance).toBe(100_000 + 500_000 - 20_000 - 60_000);
    // cash: +200 ATM - 2.50 tea - 50 unaccounted
    expect(b[ids.cash].balance).toBe(20_000 - 250 - 5_000);
    expect(b[ids.ewallet].balance).toBe(-1_450);
    // an investment account's ledger balance is simply what you transferred in
    expect(b[ids.inv].balance).toBe(60_000);
    expect(b[ids.inv].netTransferred).toBe(60_000);
  });

  it("net worth by ledger only changes by income and spending, never by transfers", async () => {
    const { getAccountBalances } = await import("@/lib/queries/accounts");
    const total = (await getAccountBalances()).reduce((s, a) => s + a.balance, 0);
    expect(total).toBe(100_000 + 500_000 - 1_450 - 250 - 5_000);
  });
});

describe("transaction queries", () => {
  it("filters by text across item and category, and by type", async () => {
    const { listTransactions, sumTransactions } = await import("@/lib/queries/transactions");
    const latte = await listTransactions({ q: "latte" });
    expect(latte.map((t) => t.item)).toEqual(["Starbucks latte"]);
    const byCategory = await listTransactions({ q: "Eating Out" });
    expect(byCategory).toHaveLength(2);
    expect((await listTransactions({ type: "transfer" })).map((t) => t.amount)).toEqual([60_000, 20_000]);

    const totals = await sumTransactions({ from: "2026-10-01", to: "2026-10-31" });
    expect(totals).toMatchObject({ income: 500_000, expense: 1_450 + 250 + 5_000, transfer: 80_000, count: 6 });
  });

  it("an account filter matches money going in OR out, and shows both account names on transfers", async () => {
    const { listTransactions } = await import("@/lib/queries/transactions");
    const cashRows = await listTransactions({ accountId: ids.cash });
    expect(cashRows).toHaveLength(3); // ATM in, tea out, reconciliation out
    const atm = cashRows.find((t) => t.type === "transfer")!;
    expect(atm).toMatchObject({ accountName: "Bank Account", toAccountName: "Cash in Hand" });
  });

  it("orders newest first and respects limit/offset", async () => {
    const { listTransactions } = await import("@/lib/queries/transactions");
    const rows = await listTransactions({ limit: 2, offset: 1 });
    expect(rows.map((t) => t.date)).toEqual(["2026-10-05", "2026-10-04"]);
  });
});

describe("analytics rows exclude transfers", () => {
  it("listFlowRows returns only income and expenses", async () => {
    const { listFlowRows } = await import("@/lib/queries/analytics");
    const rows = await listFlowRows("2026-10-01", "2026-10-31");
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.type === "income" || r.type === "expense")).toBe(true);
    expect(rows.find((r) => r.item === "Cash reconciliation")?.isSystem).toBe(true);
  });
});

describe("investments", () => {
  it("values an S&P holding from its latest snapshot and measures growth against money put in", async () => {
    h.db
      .insert(valuations)
      .values([
        { accountId: ids.inv, date: "2026-10-05", value: 60_000 },
        { accountId: ids.inv, date: "2026-10-09", value: 63_000 },
      ])
      .run();
    const { listInvestments } = await import("@/lib/queries/investments");
    const [row] = await listInvestments("2026-10-09");
    expect(row.invested).toBe(60_000);
    expect(row.value).toBe(63_000);
    expect(row.gain).toBe(3_000);
    expect(row.gainPct).toBeCloseTo(0.05);
    expect(row.xirr).toBeNull(); // only 4 days of history - too short to annualise honestly
    expect(row.series.at(-1)).toMatchObject({ date: "2026-10-09", value: 63_000, contributed: 60_000 });
  });

  it("net worth counts investments at current value, not cost", async () => {
    const { getNetWorth } = await import("@/lib/queries/investments");
    const nw = await getNetWorth("2026-10-09");
    expect(nw.investments).toBe(63_000);
    expect(nw.total).toBe(nw.liquid + 63_000);
  });
});

describe("seeding", () => {
  it("creates the default accounts, categories and the system categories once", () => {
    const names = h.db.select().from(categories).all().map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Groceries", "Salary", "Unaccounted cash", "Cash adjustment"]));
    expect(h.db.select().from(accounts).all().filter((a) => a.type === "bank")).toHaveLength(1);
  });

  it("includes an e-wallet top-up category (spending) and a reimbursements category (money in)", () => {
    const all = h.db.select().from(categories).all();
    expect(all.find((c) => c.name === "E-wallet top-up")).toMatchObject({ type: "expense", archived: false });
    expect(all.find((c) => c.name === "Reimbursements")).toMatchObject({ type: "income", archived: false });
    expect(new Set(all.map((c) => c.name)).size).toBe(all.length); // no name twice
  });
});

describe("migration 0005: adds the IT & Gadgets category to a database that already exists", () => {
  const file = path.join(process.cwd(), "drizzle", "0005_add_it_and_gadgets_category.sql");
  const fresh = async () => (await import("@/db/open")).openDb(":memory:");
  const run = (db: DB) => {
    for (const statement of fs.readFileSync(file, "utf8").split("--> statement-breakpoint")) db.run(sql.raw(statement));
  };
  const named = (db: DB) => db.select().from(categories).all().filter((c) => c.name === "IT & Gadgets");

  it("is a default for a new database", async () => {
    expect(named(await fresh())).toMatchObject([{ type: "expense", nature: "want", icon: "💻", archived: false }]);
  });
  it("adds it to a database that has categories but lacks it, and never twice", async () => {
    const db = await fresh();
    db.delete(categories).where(inArray(categories.name, ["IT & Gadgets"])).run();
    run(db);
    run(db);
    expect(named(db)).toMatchObject([{ type: "expense", nature: "want" }]);
  });
  it("leaves a brand-new, still-empty database alone, so the seeder can add ALL the defaults", async () => {
    const db = await fresh();
    db.delete(categories).run();
    run(db);
    expect(db.select().from(categories).all()).toHaveLength(0);
  });
});

describe("migration 0003: adds the two categories to a database that already exists", () => {
  // Each test gets its own throwaway database: these tests delete categories, which the shared one above must keep.
  const file = path.join(process.cwd(), "drizzle", "0003_add_ewallet_topup_and_reimbursement_categories.sql");
  const fresh = async () => (await import("@/db/open")).openDb(":memory:");
  const run = (db: DB) => {
    for (const statement of fs.readFileSync(file, "utf8").split("--> statement-breakpoint")) db.run(sql.raw(statement));
  };
  const named = (db: DB, n: string) => db.select().from(categories).all().filter((c) => c.name === n);

  it("adds them to a database that has categories but lacks these two", async () => {
    const db = await fresh();
    db.delete(categories).where(inArray(categories.name, ["E-wallet top-up", "Reimbursements"])).run();
    run(db);
    expect(named(db, "E-wallet top-up")).toMatchObject([{ type: "expense", nature: "want", icon: "👛" }]);
    expect(named(db, "Reimbursements")).toMatchObject([{ type: "income" }]);
  });

  it("running it again adds nothing (it never duplicates a category you already have)", async () => {
    const db = await fresh(); // already has both, from the seeder
    run(db);
    run(db);
    expect(named(db, "E-wallet top-up")).toHaveLength(1);
    expect(named(db, "Reimbursements")).toHaveLength(1);
  });

  it("leaves a brand-new, still-empty database alone, so the seeder can add ALL the defaults", async () => {
    const db = await fresh();
    db.delete(categories).run(); // the seeder runs AFTER migrations, so a new database has no categories when this runs
    run(db);
    expect(db.select().from(categories).all()).toHaveLength(0);
  });
});
