import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, billShares, categories, holdings, recurringBills, transactions, valuations } from "@/db/schema";

// Real actions + real SQL on an in-memory database; only Next's plumbing is stubbed (see plan-actions.test.ts).
const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const RM = (n: number) => Math.round(n * 100);
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const readable = (url: string | null) => decodeURIComponent((url ?? "").replaceAll("+", " "));
async function redirected(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m.startsWith("NEXT_REDIRECT:")) return m.slice("NEXT_REDIRECT:".length);
    throw e;
  }
}

let main: number, inv: number, subsCat: number;
const accs = () => h.db.select().from(accounts).all();
const txs = () => h.db.select().from(transactions).all();
const raw = () => (h.db as unknown as { $client: { exec(sql: string): void } }).$client;

beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  main = accs().find((a) => a.type === "bank")!.id;
  subsCat = h.db.select().from(categories).all().find((c) => c.name === "Subscriptions")!.id;
  inv = h.db.insert(accounts).values({ name: "Fund", type: "investment", openingBalance: 0 }).returning().get().id;
});

describe("dates and amounts are bounded (SEC-07)", () => {
  it("payBill, recordSalary and recordPaydayTransfer refuse 2026-13-45 and 2026-02-31", async () => {
    const { payBill, recordSalary, recordPaydayTransfer } = await import("@/app/actions/plan");
    h.db.update(accounts).set({ purpose: "spending" }).where(eq(accounts.id, main)).run();
    const bill = h.db.insert(recurringBills).values({ name: "Rent", accountId: main, categoryId: subsCat, amountMin: RM(10), amountMax: RM(10) }).returning().get().id;
    for (const date of ["2026-13-45", "2026-02-31"]) {
      expect(readable(await redirected(payBill(fd({ billId: String(bill), amount: "10", date }))))).toMatch(/valid date/);
      expect(readable(await redirected(recordSalary(fd({ amount: "5000", date }))))).toMatch(/valid date/);
      expect(readable(await redirected(recordPaydayTransfer(fd({ amount: "100", date }))))).toMatch(/valid date/);
    }
    expect(txs()).toHaveLength(0);
  });

  it("an amount above RM 1 billion is refused with a clear message", async () => {
    const { payBill } = await import("@/app/actions/plan");
    const bill = h.db.insert(recurringBills).values({ name: "Rent", accountId: main, categoryId: subsCat, amountMin: RM(10), amountMax: RM(10) }).returning().get().id;
    expect(readable(await redirected(payBill(fd({ billId: String(bill), amount: "99999999999999", date: "2026-05-01" }))))).toMatch(/too large/);
    expect(txs()).toHaveLength(0);
  });

  it("valuations and investments refuse impossible dates", async () => {
    const { recordValuation, addInvestment } = await import("@/app/actions/investments");
    expect(readable(await redirected(recordValuation(fd({ accountId: String(inv), value: "100", date: "2026-02-30" }))))).toMatch(/valid date/);
    expect(readable(await redirected(addInvestment(fd({ product: "other", name: "X", date: "2026-00-10" }))))).toMatch(/valid date/);
    expect(h.db.select().from(valuations).all()).toHaveLength(0);
  });
});

describe("recordSalary needs its category", () => {
  it("refuses with a way out when 'Salary' was renamed or archived", async () => {
    const { recordSalary } = await import("@/app/actions/plan");
    h.db.update(accounts).set({ purpose: "spending" }).where(eq(accounts.id, main)).run();
    const salary = h.db.select().from(categories).all().find((c) => c.name === "Salary")!;
    h.db.update(categories).set({ archived: true }).where(eq(categories.id, salary.id)).run();
    expect(readable(await redirected(recordSalary(fd({ amount: "5000", date: "2026-05-25" }))))).toMatch(/named "Salary"/);
    h.db.update(categories).set({ archived: false, name: "Pay" }).where(eq(categories.id, salary.id)).run();
    expect(readable(await redirected(recordSalary(fd({ amount: "5000", date: "2026-05-25" }))))).toMatch(/named "Salary"/);
    expect(txs()).toHaveLength(0);
  });
});

describe("investment actions check their accounts (SEC-08)", () => {
  it("recordInvestmentFlow refuses a bad target, a non-investment, or an investment on the other side", async () => {
    const { recordInvestmentFlow } = await import("@/app/actions/investments");
    const flow = (o: Record<string, string>) => fd({ accountId: String(inv), fromAccountId: String(main), amount: "10", date: "2026-05-01", direction: "in", ...o });
    expect(readable(await redirected(recordInvestmentFlow(flow({ accountId: "9999" }))))).toMatch(/isn't an investment/);
    expect(readable(await redirected(recordInvestmentFlow(flow({ accountId: String(main) }))))).toMatch(/isn't an investment/);
    expect(readable(await redirected(recordInvestmentFlow(flow({ fromAccountId: "9999" }))))).toMatch(/no longer exists/);
    expect(readable(await redirected(recordInvestmentFlow(flow({ fromAccountId: String(inv) }))))).toMatch(/Move money between/);
    expect(txs()).toHaveLength(0);
    expect(await redirected(recordInvestmentFlow(flow({})))).toBe("/invest?saved=flow");
    expect(txs()).toHaveLength(1);
  });

  it("addInvestment with an unknown funding account creates nothing", async () => {
    const { addInvestment } = await import("@/app/actions/investments");
    const before = accs().length;
    const url = await redirected(addInvestment(fd({ product: "other", name: "Fund B", amount: "100", fromAccountId: "9999", recordTransfer: "on", date: "2026-05-01" })));
    expect(readable(url)).toMatch(/no longer exists/);
    expect(accs()).toHaveLength(before);
    expect(h.db.select().from(holdings).all()).toHaveLength(0);
  });

  it("recordValuation, updateHolding and archiveInvestment refuse a non-investment account", async () => {
    const { recordValuation, updateHolding, archiveInvestment } = await import("@/app/actions/investments");
    expect(readable(await redirected(recordValuation(fd({ accountId: String(main), value: "5", date: "2026-05-01" }))))).toMatch(/isn't an investment/);
    expect(readable(await redirected(updateHolding(fd({ accountId: String(main), ticker: "SPY" }))))).toMatch(/isn't an investment/);
    expect(readable(await redirected(archiveInvestment(fd({ accountId: String(main) }))))).toMatch(/isn't an investment/);
    expect(accs().find((a) => a.id === main)!.archived).toBe(false);
  });
});

describe("account roles (saveAccount, saveCardSettings)", () => {
  const spending = () => accs().filter((a) => a.purpose === "spending").map((a) => a.id);

  it("an investment can't take a role, and the current holder keeps it", async () => {
    const { saveAccount } = await import("@/app/actions/settings");
    h.db.update(accounts).set({ purpose: "spending" }).where(eq(accounts.id, main)).run();
    const url = await redirected(saveAccount(fd({ id: String(inv), name: "Fund", type: "investment", purpose: "spending" })));
    expect(readable(url)).toMatch(/investment can't be/);
    expect(spending()).toEqual([main]);
  });

  it("an unknown id or an archived account can't take the role; nobody loses it", async () => {
    const { saveAccount } = await import("@/app/actions/settings");
    h.db.update(accounts).set({ purpose: "savings" }).where(eq(accounts.id, main)).run();
    const other = h.db.insert(accounts).values({ name: "Old", type: "bank", openingBalance: 0, archived: true }).returning().get().id;
    expect(readable(await redirected(saveAccount(fd({ id: "9999", name: "Ghost", type: "bank", purpose: "savings" }))))).toMatch(/no longer exists/);
    expect(readable(await redirected(saveAccount(fd({ id: String(other), name: "Old", type: "bank", purpose: "savings" }))))).toMatch(/archived/);
    expect(accs().find((a) => a.id === main)!.purpose).toBe("savings");
  });

  it("changing a holder's type to investment without the role field is refused too", async () => {
    const { saveAccount } = await import("@/app/actions/settings");
    h.db.update(accounts).set({ purpose: "spending" }).where(eq(accounts.id, main)).run();
    expect(readable(await redirected(saveAccount(fd({ id: String(main), name: "X", type: "investment" }))))).toMatch(/investment can't be/);
  });

  it("archiving the holder lets go of the role", async () => {
    const { toggleAccountArchived } = await import("@/app/actions/settings");
    h.db.update(accounts).set({ purpose: "spending" }).where(eq(accounts.id, main)).run();
    await redirected(toggleAccountArchived(fd({ id: String(main), archived: "1" })));
    expect(accs().find((a) => a.id === main)).toMatchObject({ archived: true, purpose: null });
  });

  it("saveCardSettings refuses Main on an archived account and changes nothing", async () => {
    const { saveCardSettings } = await import("@/app/actions/cards");
    h.db.update(accounts).set({ purpose: "spending" }).where(eq(accounts.id, main)).run();
    const old = h.db.insert(accounts).values({ name: "Old", type: "bank", openingBalance: 0, archived: true }).returning().get().id;
    const url = await redirected(saveCardSettings(fd({ id: String(old), network: "", color: "#112233", main: "1" })));
    expect(readable(url)).toMatch(/archived/);
    expect(spending()).toEqual([main]);
    expect(accs().find((a) => a.id === old)!.cardColor).toBeNull();
  });
});

describe("a failure part-way leaves nothing half done (SEC-09)", () => {
  it("deleteBill rolls back every step when the final delete fails", async () => {
    const { deleteBill } = await import("@/app/actions/plan");
    const bill = h.db.insert(recurringBills).values({ name: "Net", accountId: main, categoryId: subsCat, amountMin: RM(10), amountMax: RM(10) }).returning().get().id;
    const t = h.db.insert(transactions).values({ date: "2026-05-01", type: "expense", amount: RM(10), accountId: main, categoryId: subsCat, billId: bill }).returning().get().id;
    // A trigger makes the last statement fail, as a constraint would.
    raw().exec("CREATE TRIGGER stop BEFORE DELETE ON recurring_bills BEGIN SELECT RAISE(ABORT, 'nope'); END");
    await expect(deleteBill(fd({ id: String(bill) }))).rejects.toThrow();
    expect(h.db.select().from(transactions).where(eq(transactions.id, t)).get()!.billId).toBe(bill);
  });

  it("saveAccount rolls the role back when the write fails", async () => {
    const { saveAccount } = await import("@/app/actions/settings");
    h.db.update(accounts).set({ purpose: "spending" }).where(eq(accounts.id, main)).run();
    const other = h.db.insert(accounts).values({ name: "Two", type: "bank", openingBalance: 0 }).returning().get().id;
    raw().exec("CREATE TRIGGER stop BEFORE UPDATE OF name ON accounts BEGIN SELECT RAISE(ABORT, 'nope'); END");
    await expect(saveAccount(fd({ id: String(other), name: "Renamed", type: "bank", purpose: "spending" }))).rejects.toThrow();
    expect(accs().find((a) => a.id === main)!.purpose).toBe("spending");
  });
});

describe("saveShare on a bill paid in turns", () => {
  it("stores the whole turn, not the typed monthly part", async () => {
    const { saveShare } = await import("@/app/actions/shares");
    const sp = h.db.insert(recurringBills).values({ name: "Spotify", accountId: main, categoryId: subsCat, amountMin: RM(30.9), amountMax: RM(30.9), sharing: "turns" }).returning().get().id;
    await redirected(saveShare(fd({ billId: String(sp), name: "Ana", share: "5.15", startMonth: "2026-01", active: "on" })));
    expect(h.db.select().from(billShares).all()[0].share).toBe(RM(30.9));
  });

  it("editing a person who is gone says so instead of doing nothing", async () => {
    const { saveShare } = await import("@/app/actions/shares");
    const b = h.db.insert(recurringBills).values({ name: "Netflix", accountId: main, categoryId: subsCat, amountMin: RM(88.9), amountMax: RM(88.9) }).returning().get().id;
    const url = await redirected(saveShare(fd({ id: "9999", billId: String(b), name: "Ana", share: "22.25", startMonth: "2026-01" })));
    expect(readable(url)).toMatch(/no longer on a shared bill/);
    expect(h.db.select().from(billShares).all()).toHaveLength(0);
  });
});
