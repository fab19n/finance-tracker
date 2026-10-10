import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/db/open";
import { accounts, categories, recurringBills, transactions } from "@/db/schema";
import { findLookalikes, type LookalikeQuery } from "@/lib/queries/lookalikes";

// The Add form's "already in your books?" check, against a real in-memory database. Names and figures are invented.
// Only Next's plumbing is stubbed (the action revalidates paths), as in actions.test.ts.
const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

let bank: number;
let savings: number;
let cash: number;
let n = 0;

beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  const add = (name: string, type: "bank" | "cash") => h.db.insert(accounts).values({ name, type }).returning({ id: accounts.id }).get().id;
  bank = add("Alpha Bank", "bank");
  savings = add("Alpha Savings", "bank");
  cash = add("Wallet", "cash");
});

type Row = Partial<typeof transactions.$inferInsert>;
const put = (row: Row) =>
  h.db.insert(transactions).values({ date: "2026-10-09", type: "expense", amount: 1960, accountId: bank, ...row }).returning({ id: transactions.id }).get().id;
/** A line the bank import wrote: it carries a fingerprint and the bank's own wording. */
const imported = (row: Row = {}) => put({ item: "Test Grocer", note: "PAYMENT VIA MYDEBIT TEST GROCER KL", importKey: `key-${++n}`, ...row });
const ask = (q: Partial<LookalikeQuery> = {}) =>
  findLookalikes(h.db, { type: "expense", amount: 1960, date: "2026-10-09", accountId: bank, toAccountId: null, ...q });
const ids = (found: { id: number }[]) => found.map((f) => f.id);

describe("findLookalikes", () => {
  it("finds the bank's line for the same account and amount, on the same day or a day off", () => {
    const id = imported({ date: "2026-10-08" });
    expect(ask({ date: "2026-10-09" })).toMatchObject([
      { id, type: "expense", where: "Alpha Bank", label: "Test Grocer", bankText: "PAYMENT VIA MYDEBIT TEST GROCER KL" },
    ]);
    expect(ids(ask({ date: "2026-10-08" }))).toEqual([id]);
  });

  it("allows two days either way for an expense, not three (the importer's own slack for a typed entry)", () => {
    const id = imported({ date: "2026-10-09" });
    expect(ids(ask({ date: "2026-10-11" }))).toEqual([id]);
    expect(ids(ask({ date: "2026-10-07" }))).toEqual([id]);
    expect(ask({ date: "2026-10-12" })).toEqual([]);
    expect(ask({ date: "2026-10-06" })).toEqual([]);
  });

  it("ignores entries you typed yourself: only the bank's lines can be the same purchase twice", () => {
    put({ item: "Lunch" });
    expect(ask()).toEqual([]);
  });

  it("needs the same account and the exact amount", () => {
    imported({ accountId: savings });
    imported({ amount: 1961 });
    imported({ amount: 1959 });
    expect(ask()).toEqual([]);
  });

  describe("direction", () => {
    it("an expense matches money going OUT: spending, or a transfer away from the account (an ATM withdrawal)", () => {
      const spend = imported();
      const atm = imported({ type: "transfer", toAccountId: cash, item: "ATM withdrawal" });
      expect(ids(ask())).toEqual([atm, spend]);
    });
    it("...never money coming in", () => {
      imported({ type: "income" });
      imported({ type: "transfer", accountId: savings, toAccountId: bank });
      expect(ask()).toEqual([]);
      // the same transfer IS money out of the account it left
      expect(ask({ accountId: savings })).toHaveLength(1);
    });
    it("an income matches money coming IN: income, or a transfer to the account", () => {
      const pay = imported({ type: "income" });
      const moved = imported({ type: "transfer", accountId: savings, toAccountId: bank });
      expect(ids(ask({ type: "income" }))).toEqual([moved, pay]);
      imported({ type: "expense", accountId: bank });
      expect(ask({ type: "income" })).toHaveLength(2);
    });
  });

  describe("a transfer", () => {
    const move = (q: Partial<LookalikeQuery> = {}) => ask({ type: "transfer", amount: 20000, accountId: bank, toAccountId: cash, ...q });
    it("matches the same transfer, with three days of slack because its two sides post on different days", () => {
      const id = imported({ type: "transfer", amount: 20000, toAccountId: cash, date: "2026-10-06" });
      expect(ids(move())).toEqual([id]);
      expect(move({ date: "2026-10-10" })).toEqual([]);
    });
    it("...but not the reverse movement, nor a transfer between other accounts", () => {
      imported({ type: "transfer", amount: 20000, accountId: cash, toAccountId: bank });
      imported({ type: "transfer", amount: 20000, accountId: savings, toAccountId: cash });
      expect(move()).toEqual([]);
    });
    it("also matches one side of it that the import filed as plain spending (out of the source) or income (into the destination)", () => {
      const out = imported({ type: "expense", amount: 20000 });
      const into = imported({ type: "income", amount: 20000, accountId: cash });
      expect(ids(move())).toEqual([into, out]);
      // ...but not spending at the destination, nor income at the source
      imported({ type: "expense", amount: 20000, accountId: cash });
      imported({ type: "income", amount: 20000, accountId: bank });
      expect(move()).toHaveLength(2);
    });
    it("gives an expense-shaped line only the usual two days", () => {
      imported({ type: "expense", amount: 20000, date: "2026-10-06" });
      expect(move()).toEqual([]);
    });
    it("is named by both ends, and by the bank's wording when nothing else names it", () => {
      imported({ type: "transfer", amount: 5000, toAccountId: cash, item: null, note: "WITHDRAWAL AT MEPS" });
      expect(ask({ type: "transfer", amount: 5000, toAccountId: cash })).toMatchObject([
        { type: "transfer", where: "Alpha Bank -> Wallet", label: "WITHDRAWAL AT MEPS", bankText: null },
      ]);
    });
  });

  it("lists the closest date first, the newest among equals, and no more than three", () => {
    imported({ date: "2026-10-07" });
    const exact = imported({ date: "2026-10-09" });
    const after = imported({ date: "2026-10-10" });
    const before = imported({ date: "2026-10-08" });
    expect(ids(ask())).toEqual([exact, before, after]);
  });

  it("shows the bank's wording only when it says something the name does not", () => {
    imported({ item: "Test Grocer", note: "test grocer" });
    expect(ask()[0].bankText).toBeNull();
  });

  describe("adoptable (the description and category you typed can go straight onto it)", () => {
    it("is true for plain spending and income", () => {
      imported();
      imported({ type: "income" });
      expect(ask().map((m) => m.adoptable)).toEqual([true]);
      expect(ask({ type: "income" }).map((m) => m.adoptable)).toEqual([true]);
    });
    it("is false for a transfer: it has no category, and an ATM withdrawal is not a purchase", () => {
      imported({ type: "transfer", toAccountId: cash });
      expect(ask().map((m) => m.adoptable)).toEqual([false]);
    });
    it("is false for a bill's payment: it already carries the bill's name and category", () => {
      const bill = h.db.insert(recurringBills).values({ name: "Test Bill", accountId: bank, amountMin: 1960, amountMax: 1960 }).returning({ id: recurringBills.id }).get().id;
      imported({ billId: bill });
      expect(ask().map((m) => m.adoptable)).toEqual([false]);
    });
  });

  it("says nothing for what isn't a real entry yet", () => {
    imported();
    expect(ask({ amount: 0 })).toEqual([]);
    expect(ask({ amount: -1960 })).toEqual([]);
    expect(ask({ amount: 19.6 })).toEqual([]);
    expect(ask({ date: "2026-02-31" })).toEqual([]);
    expect(ask({ date: "" })).toEqual([]);
    expect(ask({ type: "transfer", toAccountId: null })).toEqual([]);
  });
});

describe("GET /transactions/lookalikes", () => {
  const get = async (query: string) => {
    const { GET } = await import("@/app/(app)/transactions/lookalikes/route");
    return GET(new Request(`http://localhost/transactions/lookalikes?${query}`));
  };

  it("answers with the matches, never cached", async () => {
    const id = imported();
    const res = await get(`type=expense&amount=1960&date=2026-10-09&account=${bank}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ matches: [{ id, label: "Test Grocer" }] });
  });

  it("takes the destination of a transfer from `to`", async () => {
    const id = imported({ type: "transfer", amount: 5000, toAccountId: cash });
    const res = await get(`type=transfer&amount=5000&date=2026-10-09&account=${bank}&to=${cash}`);
    expect(await res.json()).toMatchObject({ matches: [{ id }] });
  });

  it("refuses a request that makes no sense, with an empty answer the form can ignore", async () => {
    for (const bad of [
      "type=expense&date=2026-10-09&account=1",
      "type=expense&amount=abc&date=2026-10-09&account=1",
      "type=expense&amount=0&date=2026-10-09&account=1",
      "type=expense&amount=1960&date=9-Oct&account=1",
      "type=refund&amount=1960&date=2026-10-09&account=1",
      "type=transfer&amount=1960&date=2026-10-09&account=1",
    ]) {
      const res = await get(bad);
      expect([bad, res.status]).toEqual([bad, 400]);
      expect(await res.json()).toEqual({ matches: [] });
    }
  });

  it("answers an impossible date with nothing rather than an error", async () => {
    imported();
    const res = await get(`type=expense&amount=1960&date=2026-02-31&account=${bank}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matches: [] });
  });
});

describe("adoptLookalike: 'use the bank's entry' instead of adding it twice", () => {
  const cat = (name: string) => h.db.select().from(categories).where(eq(categories.name, name)).get()!.id;
  const row = (id: number) => h.db.select().from(transactions).where(eq(transactions.id, id)).get()!;
  const count = () => h.db.select().from(transactions).all().length;

  /** What the form posts: the entry as typed, plus which bank entry to use. */
  const adopt = async (id: number, over: Record<string, string> = {}) => {
    const { adoptLookalike } = await import("@/app/actions/transactions");
    const fd = new FormData();
    const fields = { adopt: String(id), type: "expense", amount: "19.60", date: "2026-10-09", accountId: String(bank), categoryId: String(cat("Groceries")), item: "Mixers for rum", ...over };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return adoptLookalike({ ok: false }, fd);
  };

  it("puts your description and category on the bank's entry, and adds nothing", async () => {
    const id = imported({ categoryId: cat("Eating Out") });
    const before = row(id);
    const r = await adopt(id, { item: "  Mixers for rum " });
    expect(r).toMatchObject({ ok: true, message: expect.stringContaining("9 Oct") });
    expect(r.message).toMatch(/RM\s19\.60/); // formatRM puts a non-breaking space after "RM"
    expect(r.message).toContain("description and category");
    expect(row(id)).toMatchObject({ item: "Mixers for rum", categoryId: cat("Groceries") });
    expect(count()).toBe(1);
    // everything else stays the bank's: the date and text are what later imports match and learn from
    expect(row(id)).toMatchObject({ date: before.date, amount: before.amount, accountId: before.accountId, note: before.note, importKey: before.importKey, type: "expense" });
  });

  it("an item alone leaves the category; a category alone leaves the item", async () => {
    const a = imported({ categoryId: cat("Eating Out") });
    expect(await adopt(a, { categoryId: "", item: "Mixers" })).toMatchObject({ ok: true, message: expect.stringContaining("your description on it") });
    expect(row(a)).toMatchObject({ item: "Mixers", categoryId: cat("Eating Out") });

    const b = imported({ date: "2026-10-08", categoryId: cat("Eating Out") });
    const r = await adopt(b, { item: "" });
    expect(r).toMatchObject({ ok: true, message: expect.stringContaining("your category on it") });
    expect(row(b)).toMatchObject({ item: "Test Grocer", categoryId: cat("Groceries") });
  });

  it("does only the entry it was told to", async () => {
    const first = imported({ date: "2026-10-08" });
    const second = imported({ date: "2026-10-09" });
    await adopt(second);
    expect(row(second).item).toBe("Mixers for rum");
    expect(row(first).item).toBe("Test Grocer");
  });

  it("works for income too", async () => {
    const id = imported({ type: "income", categoryId: cat("Other Income") });
    expect(await adopt(id, { type: "income", categoryId: String(cat("Salary")), item: "October pay" })).toMatchObject({ ok: true });
    expect(row(id)).toMatchObject({ type: "income", item: "October pay", categoryId: cat("Salary") });
  });

  it("refuses when there is nothing to put on it", async () => {
    const id = imported();
    const r = await adopt(id, { categoryId: "", item: "   " });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Pick a category or say what it was") });
    expect(row(id).item).toBe("Test Grocer");
  });

  it("refuses an entry that is no longer a lookalike of what the form holds", async () => {
    const id = imported();
    const changed: Record<string, string>[] = [{ amount: "19.61" }, { accountId: String(savings) }, { date: "2026-10-13" }];
    for (const over of changed) {
      expect(await adopt(id, over)).toMatchObject({ ok: false, error: expect.stringContaining("no longer matches") });
    }
    expect(row(id).item).toBe("Test Grocer");
  });

  it("never rewrites an entry you typed yourself", async () => {
    const id = put({ item: "Lunch" });
    expect(await adopt(id)).toMatchObject({ ok: false });
    expect(row(id).item).toBe("Lunch");
  });

  it("never rewrites a bill's payment, nor a transfer", async () => {
    const bill = h.db.insert(recurringBills).values({ name: "Test Bill", accountId: bank, amountMin: 1960, amountMax: 1960 }).returning({ id: recurringBills.id }).get().id;
    const billed = imported({ billId: bill, item: "Test Bill" });
    const atm = imported({ type: "transfer", toAccountId: cash, item: "ATM withdrawal" });
    expect(await adopt(billed)).toMatchObject({ ok: false });
    expect(await adopt(atm)).toMatchObject({ ok: false });
    expect([row(billed).item, row(atm).item]).toEqual(["Test Bill", "ATM withdrawal"]);
  });

  it("refuses a category of the wrong kind, a missing id, and a transfer form", async () => {
    const id = imported();
    expect(await adopt(id, { categoryId: String(cat("Salary")) })).toMatchObject({ ok: false, error: expect.stringContaining("doesn't match") });
    expect(await adopt(id, { adopt: "abc" })).toMatchObject({ ok: false });
    expect(await adopt(id, { type: "transfer" })).toMatchObject({ ok: false });
    expect(await adopt(9999)).toMatchObject({ ok: false, error: expect.stringContaining("no longer matches") });
    expect(row(id).item).toBe("Test Grocer");
  });
});
