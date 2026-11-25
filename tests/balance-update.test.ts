import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/db/open";
import { accounts, categories, transactions } from "@/db/schema";
import { interestCategory, judgeBalance, unusualAbove } from "@/lib/balance-update";
import { shiftDays, todayISO } from "@/lib/dates";

// The real action + real SQL on an in-memory database; only Next's plumbing is stubbed (see actions.test.ts).
const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const RM = (n: number) => Math.round(n * 100);
const plain = (s: string) => s.replace(/ /g, " ");

describe("judging what the bank shows", () => {
  it("calls the extra interest, and says nothing needs doing when they agree", () => {
    expect(judgeBalance(RM(2000), RM(2006.58))).toEqual({ kind: "interest", amount: RM(6.58), unusual: false });
    expect(judgeBalance(RM(2000), RM(2000))).toEqual({ kind: "match" });
  });
  it("never reads a shortfall as interest", () => {
    expect(judgeBalance(RM(2000), RM(1999.99))).toEqual({ kind: "lower", short: 1 });
  });
  it("doubts anything over 1% of the balance, but never anything up to RM 5", () => {
    expect(unusualAbove(RM(2000))).toBe(RM(20));
    expect(judgeBalance(RM(2000), RM(2020))).toMatchObject({ unusual: false });
    expect(judgeBalance(RM(2000), RM(2020.01))).toMatchObject({ unusual: true });
    expect(unusualAbove(RM(100))).toBe(RM(5));
    expect(unusualAbove(-RM(50))).toBe(RM(5));
  });
  it("files it under your own Interest category when there is one", () => {
    const cats = (...names: string[]) => names.map((name) => ({ name }));
    expect(interestCategory(cats("Salary", "Investment Income", "interest "))?.name).toBe("interest ");
    expect(interestCategory(cats("Salary", "Other Income", "Investment Income"))?.name).toBe("Investment Income");
    expect(interestCategory(cats("Salary", "Other Income"))?.name).toBe("Other Income");
    expect(interestCategory(cats("Salary"))?.name).toBe("Salary");
    expect(interestCategory([])).toBeUndefined();
  });
});

describe("updateBalance", () => {
  const today = todayISO();
  const yesterday = shiftDays(today, -1);
  let pocket: number, mae: number, cash: number;

  beforeEach(async () => {
    const { openDb } = await import("@/db/open");
    h.db = openDb(":memory:");
    const add = (name: string, type: "bank" | "cash", openingBalance = 0) => h.db.insert(accounts).values({ name, type, openingBalance }).returning().get().id;
    pocket = add("Pocket", "bank");
    mae = add("Paying account", "bank", RM(5000));
    cash = add("Wallet cash", "cash");
    h.db.insert(transactions).values({ date: yesterday, type: "transfer", amount: RM(2000), accountId: mae, toAccountId: pocket }).run();
  });

  const run = async (over: Partial<Parameters<typeof import("@/app/actions/balance").updateBalance>[0]> = {}) =>
    (await import("@/app/actions/balance")).updateBalance({ accountId: pocket, balance: "2006.58", date: today, ...over });
  const interest = () => h.db.select().from(transactions).where(eq(transactions.type, "income")).all();

  it("only reports the difference at first, then records it once when confirmed", async () => {
    expect(await run()).toMatchObject({ kind: "confirm", interest: RM(6.58), books: RM(2000), shown: RM(2006.58), category: "Investment Income", unusual: false });
    expect(interest()).toHaveLength(0);

    const done = await run({ confirm: RM(6.58) });
    expect(done.kind).toBe("recorded");
    const [entry] = interest();
    const category = h.db.select().from(categories).where(eq(categories.id, entry.categoryId!)).get()!;
    expect(entry).toMatchObject({ date: today, amount: RM(6.58), accountId: pocket, item: "Interest" });
    expect(category.name).toBe("Investment Income");
    expect(plain(entry.note!)).toBe("Balance update: the bank showed RM 2,006.58, the app had RM 2,000.00");

    // A second tap, or the same figure again, finds the books in agreement.
    expect((await run({ confirm: RM(6.58) })).kind).toBe("match");
    expect(interest()).toHaveLength(1);
  });

  it("records nothing when the confirmed figure no longer holds", async () => {
    // An entry arrived after the preview, so the difference on screen is stale: show the new one instead.
    h.db.insert(transactions).values({ date: today, type: "transfer", amount: RM(1), accountId: mae, toAccountId: pocket }).run();
    expect(await run({ confirm: RM(6.58) })).toMatchObject({ kind: "confirm", interest: RM(5.58), needsTick: false });
    expect(interest()).toHaveLength(0);
  });

  it("compares with the app at the end of the chosen day: later entries don't count", async () => {
    h.db.insert(transactions).values({ date: today, type: "transfer", amount: RM(500), accountId: mae, toAccountId: pocket }).run();
    expect(await run({ date: yesterday })).toMatchObject({ kind: "confirm", books: RM(2000), interest: RM(6.58) });
    await run({ date: yesterday, confirm: RM(6.58) });
    expect(interest()[0].date).toBe(yesterday);
  });

  it("never records a shortfall", async () => {
    const r = await run({ balance: "1,990", confirm: -RM(10) });
    expect(r.kind).toBe("lower");
    expect(plain((r as { message: string }).message)).toContain("RM 10.00 less than the app's RM 2,000.00");
    expect(interest()).toHaveLength(0);
  });

  it("needs a tick as well before recording an unusually large difference", async () => {
    expect(await run({ balance: "2500" })).toMatchObject({ kind: "confirm", unusual: true, needsTick: false });
    expect(await run({ balance: "2500", confirm: RM(500) })).toMatchObject({ kind: "confirm", needsTick: true });
    expect(interest()).toHaveLength(0);
    expect((await run({ balance: "2500", confirm: RM(500), trusted: true })).kind).toBe("recorded");
    expect(interest()).toHaveLength(1);
  });

  it("refuses what it can't trust: bad figures and dates, and accounts it isn't for", async () => {
    for (const bad of [{ balance: "" }, { balance: "abc" }, { balance: "2006.585" }, { balance: "-5" }, { balance: "99999999999" }, { date: "2026-02-31" }, { date: shiftDays(today, 1) }, { accountId: cash }, { accountId: 99999 }]) {
      expect((await run(bad)).kind, JSON.stringify(bad)).toBe("error");
    }
    h.db.update(accounts).set({ archived: true }).where(eq(accounts.id, pocket)).run();
    expect((await run()).kind).toBe("error");
    expect(interest()).toHaveLength(0);
  });
});
