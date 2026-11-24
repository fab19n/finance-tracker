import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/db/open";
import { accounts, categories, transactions } from "@/db/schema";
import { balanceAfterById, recentChange } from "@/lib/movements";

// Real SQL and real actions against an in-memory database; only Next's plumbing is stubbed (as actions.test.ts does).
const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
async function redirected(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m.startsWith("NEXT_REDIRECT:")) return decodeURIComponent(m.slice(14).replaceAll("+", " "));
    throw e;
  }
  throw new Error("did not redirect");
}

let bank: number, cash: number, food: number, salary: number;
const row = (id: number) => h.db.select().from(accounts).where(eq(accounts.id, id)).get()!;

beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  const a = h.db.select().from(accounts).all();
  const c = h.db.select().from(categories).all();
  bank = a.find((x) => x.type === "bank")!.id;
  cash = a.find((x) => x.type === "cash")!.id;
  food = c.find((x) => x.name === "Eating Out")!.id;
  salary = c.find((x) => x.name === "Salary")!.id;
});

describe("balance after each movement", () => {
  it("ends on exactly the figure on the account card, transfers included", async () => {
    const { getAccountBalances } = await import("@/lib/queries/accounts");
    const { getAccountLedger } = await import("@/lib/queries/ledger");
    h.db.update(accounts).set({ openingBalance: 100_000 }).where(eq(accounts.id, bank)).run();
    const ids = h.db
      .insert(transactions)
      .values([
        { date: "2026-10-01", type: "income", amount: 500_000, accountId: bank, categoryId: salary, item: "Salary" },
        { date: "2026-10-02", type: "expense", amount: 1_450, accountId: bank, categoryId: food, item: "Lunch" },
        { date: "2026-10-03", type: "transfer", amount: 20_000, accountId: bank, toAccountId: cash },
        { date: "2026-10-03", type: "expense", amount: 250, accountId: bank, categoryId: food, item: "Teh" },
        { date: "2026-10-04", type: "transfer", amount: 5_000, accountId: cash, toAccountId: bank },
      ])
      .returning({ id: transactions.id })
      .all()
      .map((r) => r.id);
    const ledger = await getAccountLedger(bank);
    const after = balanceAfterById(ledger.opening, ledger.entries, bank);
    expect(ids.map((i) => after.get(i))).toEqual([600_000, 598_550, 578_550, 578_300, 583_300]);
    const card = (await getAccountBalances()).find((a) => a.id === bank)!;
    expect(after.get(ids[4])).toBe(card.balance);
  });

  it("gives nothing for an entry that is not on the account", () => {
    const after = balanceAfterById(0, [{ id: 1, date: "2026-10-01", type: "expense", amount: 100, accountId: 9, toAccountId: null }], 5);
    expect(after.size).toBe(0);
  });
});

describe("the net-worth pill", () => {
  it("is income minus spending over the window, and absent when nothing happened", async () => {
    const { getRecentFlow } = await import("@/lib/queries/accounts");
    h.db
      .insert(transactions)
      .values([
        { date: "2026-10-01", type: "income", amount: 300_000, accountId: bank, categoryId: salary },
        { date: "2026-10-05", type: "expense", amount: 12_000, accountId: bank, categoryId: food },
        { date: "2026-10-06", type: "transfer", amount: 50_000, accountId: bank, toAccountId: cash },
        { date: "2026-08-01", type: "expense", amount: 99_900, accountId: bank, categoryId: food },
      ])
      .run();
    const flow = await getRecentFlow([bank, cash], "2026-09-25", "2026-10-24");
    expect(flow).toEqual({ income: 300_000, expense: 12_000, count: 2 });
    expect(recentChange(flow)).toBe(288_000);
    const quiet = await getRecentFlow([bank], "2026-11-01", "2026-11-30");
    expect(recentChange(quiet)).toBeNull();
    expect(recentChange(await getRecentFlow([], "2026-01-01", "2026-12-31"))).toBeNull();
  });
});

describe("saveCardSettings roles", () => {
  it("Savings moves from its holder and clears Main on the same account, in one go", async () => {
    const { saveCardSettings } = await import("@/app/actions/cards");
    h.db.update(accounts).set({ purpose: "spending" }).where(eq(accounts.id, bank)).run();
    h.db.update(accounts).set({ purpose: "savings" }).where(eq(accounts.id, cash)).run();
    await redirected(saveCardSettings(fd({ id: String(bank), network: "", color: "", last4: "", main: "0", savings: "1" })));
    expect(row(bank).purpose).toBe("savings");
    expect(row(cash).purpose).toBeNull();
  });

  it("turning a role off clears it, and a form without the fields leaves it alone", async () => {
    const { saveCardSettings } = await import("@/app/actions/cards");
    h.db.update(accounts).set({ purpose: "savings" }).where(eq(accounts.id, cash)).run();
    await redirected(saveCardSettings(fd({ id: String(cash), network: "", color: "", last4: "" })));
    expect(row(cash).purpose).toBe("savings");
    await redirected(saveCardSettings(fd({ id: String(cash), network: "", color: "", last4: "", main: "0", savings: "0" })));
    expect(row(cash).purpose).toBeNull();
  });

  it("refuses both roles at once and changes nothing", async () => {
    const { saveCardSettings } = await import("@/app/actions/cards");
    const url = await redirected(saveCardSettings(fd({ id: String(bank), network: "visa", color: "#112233", last4: "", main: "1", savings: "1" })));
    expect(url).toContain("not both");
    expect(row(bank).cardNetwork).toBeNull();
  });
});

describe("addAccount", () => {
  it("adds a plain account with its opening balance and goes to its page", async () => {
    const { addAccount } = await import("@/app/actions/cards");
    const url = await redirected(addAccount(fd({ name: "  Public Bank ", type: "bank", openingBalance: "RM 1,250.50", main: "0", savings: "0" })));
    const made = h.db.select().from(accounts).all().find((a) => a.name === "Public Bank")!;
    expect(url).toBe(`/accounts/${made.id}`);
    expect(made).toMatchObject({ type: "bank", openingBalance: 125_050, purpose: null, cardNetwork: null, archived: false });
  });

  it("takes the Main role from its holder in the same step, and accepts a negative opening balance", async () => {
    const { addAccount } = await import("@/app/actions/cards");
    h.db.update(accounts).set({ purpose: "spending" }).where(eq(accounts.id, bank)).run();
    await redirected(addAccount(fd({ name: "Card", type: "ewallet", openingBalance: "-20", main: "1", savings: "0" })));
    const made = h.db.select().from(accounts).all().find((a) => a.name === "Card")!;
    expect(made).toMatchObject({ purpose: "spending", openingBalance: -2_000 });
    expect(row(bank).purpose).toBeNull();
  });

  it("refuses a missing name, an unknown type, a bad amount or both roles, and adds nothing", async () => {
    const { addAccount } = await import("@/app/actions/cards");
    const before = h.db.select().from(accounts).all().length;
    const cases: Record<string, string>[] = [{ name: " " }, { type: "investment" }, { openingBalance: "lots" }, { openingBalance: "99999999999" }, { main: "1", savings: "1" }];
    for (const bad of cases) {
      const url = await redirected(addAccount(fd({ name: "X", type: "bank", openingBalance: "", ...bad })));
      expect(url).toContain("/accounts/new?error=");
    }
    expect(h.db.select().from(accounts).all().length).toBe(before);
  });
});
