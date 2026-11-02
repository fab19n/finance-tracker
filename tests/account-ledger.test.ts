import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DB } from "@/db/open";
import { accounts, categories, transactions } from "@/db/schema";

// Real SQL against an in-memory database, as db.test.ts does: only the Next-specific accessor is swapped.
const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));

let ids: { bank: number; cash: number; ewallet: number; food: number; salary: number };

beforeAll(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  const accs = h.db.select().from(accounts).all();
  const cats = h.db.select().from(categories).all();
  ids = {
    bank: accs.find((a) => a.type === "bank")!.id,
    cash: accs.find((a) => a.type === "cash")!.id,
    ewallet: accs.find((a) => a.type === "ewallet")!.id,
    food: cats.find((c) => c.name === "Eating Out")!.id,
    salary: cats.find((c) => c.name === "Salary")!.id,
  };
  h.db.update(accounts).set({ openingBalance: 100_000 }).where(eq(accounts.id, ids.bank)).run();
  h.db
    .insert(transactions)
    .values([
      { date: "2026-10-01", type: "income", amount: 500_000, accountId: ids.bank, categoryId: ids.salary, item: "Salary" },
      { date: "2026-10-02", type: "expense", amount: 1_450, accountId: ids.bank, categoryId: ids.food, item: "Nasi lemak" },
      { date: "2026-10-03", type: "transfer", amount: 20_000, accountId: ids.bank, toAccountId: ids.cash, note: "ATM" },
      { date: "2026-10-04", type: "expense", amount: 250, accountId: ids.cash, categoryId: ids.food, item: "Teh tarik" },
      { date: "2026-10-09", type: "expense", amount: 6_800, accountId: ids.bank, categoryId: ids.food, item: "Netflix" },
      { date: "2026-10-12", type: "expense", amount: 3_000, accountId: ids.ewallet, categoryId: ids.food, item: "Combo 68" },
      { date: "2026-10-15", type: "income", amount: 12_345, accountId: ids.cash, categoryId: ids.salary, item: "Side job" },
    ])
    .run();
});

describe("searching Activity by amount", () => {
  const find = async (q: string) => {
    const { listTransactions } = await import("@/lib/queries/transactions");
    return (await listTransactions({ q, sort: "oldest" })).map((t) => t.item ?? t.note);
  };

  it("finds the entries of exactly that amount, however it is typed", async () => {
    expect(await find("14.50")).toEqual(["Nasi lemak"]);
    expect(await find("RM 14.50")).toEqual(["Nasi lemak"]);
    expect(await find("123.45")).toEqual(["Side job"]);
    expect(await find("2.5")).toEqual(["Teh tarik"]);
  });

  it("still matches the words, so '68' finds the item called Combo 68 AND the RM 68.00 charge", async () => {
    expect(await find("68")).toEqual(["Netflix", "Combo 68"]);
  });

  it("finds nothing for an amount nobody paid", async () => {
    expect(await find("999")).toEqual([]);
  });

  it("is a whole amount, not a prefix: 14 does not find RM 14.50", async () => {
    expect(await find("14")).toEqual([]);
  });
});

describe("searching Activity by account name", () => {
  it("finds everything on that account, a transfer from either end", async () => {
    const { listTransactions } = await import("@/lib/queries/transactions");
    const on = async (q: string) => (await listTransactions({ q, sort: "oldest" })).map((t) => t.item ?? t.note);
    const cashName = h.db.select().from(accounts).where(eq(accounts.id, ids.cash)).get()!.name;
    // Cash in Hand: the ATM transfer arrives there, plus its tea and side job
    expect(await on(cashName)).toEqual(["ATM", "Teh tarik", "Side job"]);
    // the bank is on the other end of that transfer, and has the salary, lunch and Netflix
    const bankName = h.db.select().from(accounts).where(eq(accounts.id, ids.bank)).get()!.name;
    expect(await on(bankName)).toEqual(["Salary", "Nasi lemak", "ATM", "Netflix"]);
  });

  it("gives the totals the same answer as the list (they share the filter)", async () => {
    const { sumTransactions } = await import("@/lib/queries/transactions");
    const cashName = h.db.select().from(accounts).where(eq(accounts.id, ids.cash)).get()!.name;
    expect(await sumTransactions({ q: cashName })).toMatchObject({ income: 12_345, expense: 250, transfer: 20_000, count: 3 });
  });
});

describe("an account's ledger from the database", () => {
  it("returns its opening balance and every entry on either side of it", async () => {
    const { getAccountLedger } = await import("@/lib/queries/ledger");
    const bank = await getAccountLedger(ids.bank);
    expect(bank.opening).toBe(100_000);
    expect(bank.entries.map((x) => x.amount).sort((a, b) => a - b)).toEqual([1_450, 6_800, 20_000, 500_000]);
    const cash = await getAccountLedger(ids.cash);
    expect(cash.entries).toHaveLength(3); // the transfer in, the tea, the side job
    expect((await getAccountLedger(99_999)).entries).toEqual([]);
  });

  it("ends every account's history on exactly the balance its chip shows", async () => {
    const { getAccountBalances } = await import("@/lib/queries/accounts");
    const { getAccountLedger } = await import("@/lib/queries/ledger");
    const { balanceHistory } = await import("@/lib/analytics/ledger");
    for (const a of await getAccountBalances(true)) {
      const { opening, entries } = await getAccountLedger(a.id);
      const history = balanceHistory(opening, entries, a.id, { from: null, to: "2026-12-31" });
      expect(history.end, a.name).toBe(a.balance);
    }
  });

  it("builds a statement whose last balance is the account's balance", async () => {
    const { getAccountBalances } = await import("@/lib/queries/accounts");
    const { getAccountLedger } = await import("@/lib/queries/ledger");
    const { listTransactions } = await import("@/lib/queries/transactions");
    const { statementRows } = await import("@/lib/statement");
    const balances = new Map((await getAccountBalances(true)).map((a) => [a.id, a.balance]));
    for (const id of [ids.bank, ids.cash, ids.ewallet]) {
      const { opening, entries } = await getAccountLedger(id);
      const rows = await listTransactions({ accountId: id, limit: 1000 });
      const lines = statementRows({ opening, entries, accountId: id, rows, from: null });
      expect(lines.length).toBe(rows.length + 1);
      expect(lines.at(-1)![5]).toBe(((balances.get(id) ?? 0) / 100).toFixed(2));
    }
  });
});
