import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, billShares, categories, recurringBills, transactions } from "@/db/schema";
import { describeHttpStatus } from "@/lib/investing/prices";
import { valueWithFlowsSince } from "@/lib/investing/value";
import { accountParam, savedMessage, savedParams, withParams } from "@/lib/saved-notice";

// Real actions + real SQL on an in-memory database; only Next's plumbing is stubbed (see actions.test.ts).
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
async function redirected(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m.startsWith("NEXT_REDIRECT:")) return m.slice("NEXT_REDIRECT:".length);
    throw e;
  }
}

describe("saved notice helpers", () => {
  it("only known keys show a message, and the note is trimmed and capped", () => {
    expect(savedMessage("bill")).toBe("Bill saved.");
    expect(savedMessage(["bill", "x"])).toBe("Bill saved.");
    expect(savedMessage("<script>")).toBeNull();
    expect(savedMessage("toString")).toBeNull();
    expect(savedMessage(undefined)).toBeNull();
    expect(savedMessage("account", "  Main is now your Spending account.  ")).toBe("Account saved. Main is now your Spending account.");
    expect(savedMessage("account", "x".repeat(500))!.length).toBeLessThan(260);
  });
  it("adds parameters after the ones a link already has, and leaves empty ones out", () => {
    expect(withParams("/plan", { saved: "bill" })).toBe("/plan?saved=bill");
    expect(withParams("/plan?account=3", { saved: "bill" })).toBe("/plan?account=3&saved=bill");
    expect(withParams("/plan", { account: undefined, error: "" })).toBe("/plan");
    expect(withParams("/plan", { error: "a b&c" })).toBe("/plan?error=a%20b%26c");
    expect(withParams("/plan", savedParams("salary"))).toBe("/plan?saved=salary");
  });
  it("accepts only a plain account id from a form", () => {
    expect(accountParam("12")).toBe("12");
    expect(accountParam(" 7 ")).toBe("7");
    expect(accountParam("0")).toBeUndefined();
    expect(accountParam("1; drop")).toBeUndefined();
    expect(accountParam("../x")).toBeUndefined();
    expect(accountParam(null)).toBeUndefined();
  });
});

describe("holding value after money moves", () => {
  const flows = [
    { date: "2026-01-10", amount: RM(1000) },
    { date: "2026-03-05", amount: RM(500) },
    { date: "2026-04-01", amount: -RM(200) },
  ];
  it("adds what was put in after the last valuation, so adding money is not a loss", () => {
    expect(valueWithFlowsSince({ date: "2026-02-01", value: RM(1100) }, flows, "2026-06-01", RM(1300))).toBe(RM(1400));
  });
  it("does not count money that moved on or before the valuation day, or after the date asked about", () => {
    expect(valueWithFlowsSince({ date: "2026-03-05", value: RM(1600) }, flows, "2026-03-31", RM(1500))).toBe(RM(1600));
    expect(valueWithFlowsSince({ date: "2026-02-01", value: RM(1100) }, flows, "2026-03-31", RM(1500))).toBe(RM(1600));
  });
  it("follows what was put in when there is no valuation, and never goes below zero", () => {
    expect(valueWithFlowsSince(null, flows, "2026-06-01", RM(1300))).toBe(RM(1300));
    expect(valueWithFlowsSince({ date: "2026-01-01", value: RM(100) }, [{ date: "2026-02-01", amount: -RM(500) }], "2026-06-01", 0)).toBe(0);
  });
});

describe("price service messages", () => {
  it("say what a busy or broken service means instead of a bare status", () => {
    expect(describeHttpStatus(429)).toMatch(/busy/);
    expect(describeHttpStatus(503)).toMatch(/server had a problem \(HTTP 503\)/);
    expect(describeHttpStatus(404)).toBe("HTTP 404");
  });
});

let main: number, savings: number, subsCat: number;

beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  main = h.db.select().from(accounts).all().find((a) => a.type === "bank")!.id;
  subsCat = h.db.select().from(categories).all().find((c) => c.name === "Subscriptions")!.id;
  const { saveAccount } = await import("@/app/actions/settings");
  await redirected(saveAccount(fd({ id: String(main), name: "Main", type: "bank", openingBalance: "0", purpose: "spending" })));
  await redirected(saveAccount(fd({ name: "Rainy", type: "bank", openingBalance: "0", purpose: "savings" })));
  savings = h.db.select().from(accounts).all().find((a) => a.name === "Rainy")!.id;
});

describe("Plan actions keep the one-account filter", () => {
  it("saving, paying and deleting a bill come back to the same account view", async () => {
    const { saveBill, payBill, deleteBill } = await import("@/app/actions/plan");
    const url = await redirected(saveBill(fd({ name: "Netflix", categoryId: String(subsCat), accountId: String(main), amountMin: "55", dueDay: "8", active: "on", account: String(main) })));
    expect(url).toBe(`/plan/bills?account=${main}&saved=bill`);
    const bill = h.db.select().from(recurringBills).all()[0];
    expect(await redirected(payBill(fd({ billId: String(bill.id), amount: "55", date: "2026-10-08", account: String(main) })))).toBe(`/plan?account=${main}&saved=billPaid`);
    expect(readable(await redirected(payBill(fd({ billId: String(bill.id), amount: "zero", date: "2026-10-08", account: String(main) }))))).toMatch(
      new RegExp(`^/plan\\?account=${main}&error=Enter the amount you paid`),
    );
    expect(await redirected(deleteBill(fd({ id: String(bill.id), account: String(main) })))).toBe(`/plan/bills?account=${main}&saved=billDeleted`);
  });
  it("ignores an account value that is not a plain id", async () => {
    const { payBill } = await import("@/app/actions/plan");
    expect(await redirected(payBill(fd({ billId: "999", amount: "5", date: "2026-10-08", account: "1&error=x" })))).toMatch(/^\/plan\?error=/);
  });
});

describe("Settings notices", () => {
  it("names the account that gave up a role", async () => {
    const { saveAccount } = await import("@/app/actions/settings");
    const url = await redirected(saveAccount(fd({ id: String(savings), name: "Rainy", type: "bank", openingBalance: "0", purpose: "spending" })));
    expect(readable(url)).toContain("Rainy is now your Spending account; Main no longer is.");
    expect(url).toMatch(/^\/settings\?saved=account&note=/);
  });
  it("says that archiving the spending account released its role", async () => {
    const { toggleAccountArchived } = await import("@/app/actions/settings");
    const url = await redirected(toggleAccountArchived(fd({ id: String(main), archived: "1" })));
    expect(url).toMatch(/^\/settings\?saved=accountArchived&note=/);
    expect(readable(url)).toContain("Main was your Spending account and no longer is");
    expect(h.db.select().from(accounts).where(eq(accounts.id, main)).get()!.purpose).toBeNull();
    expect(await redirected(toggleAccountArchived(fd({ id: String(savings), archived: "0" })))).toBe("/settings?saved=accountRestored");
  });
  it("names the field a payday or investing number failed on", async () => {
    const { saveCycleSettings, saveAssumptions } = await import("@/app/actions/settings");
    expect(readable(await redirected(saveCycleSettings(fd({ paydayDay: "99", savingsRatePct: "2.5" }))))).toContain("Usual payday must be a day of the month from 1 to 31");
    expect(readable(await redirected(saveCycleSettings(fd({ paydayDay: "26", savingsRatePct: "40" }))))).toContain("Savings account rate must be between 0 and 15");
    expect(
      readable(await redirected(saveAssumptions(fd({ fdRatePct: "3", sp500ReturnPct: "8", emergencyMonths: "99", horizonYears: "15", riskProfile: "growth" })))),
    ).toContain("Emergency fund (months) must be a whole number from 0 to 36");
  });
});

describe("a person on a bill paid in turns", () => {
  it("needs no amount: the whole month is filled in, and an equal-parts bill still asks for one", async () => {
    const { saveShare } = await import("@/app/actions/shares");
    const turnsBill = h.db.insert(recurringBills).values({ name: "Spotify", accountId: main, categoryId: subsCat, amountMin: RM(30.9), amountMax: RM(30.9), sharing: "turns" }).returning().get().id;
    const monthlyBill = h.db.insert(recurringBills).values({ name: "Netflix", accountId: main, categoryId: subsCat, amountMin: RM(88.9), amountMax: RM(88.9) }).returning().get().id;
    const person = (billId: number, over: Record<string, string> = {}) => fd({ billId: String(billId), name: "Jane", startMonth: "2026-10", active: "on", ...over });
    expect(await redirected(saveShare(person(turnsBill)))).toBe("/plan/shared?saved=person");
    expect(h.db.select().from(billShares).where(eq(billShares.billId, turnsBill)).get()!.share).toBe(RM(30.9));
    expect(readable(await redirected(saveShare(person(monthlyBill))))).toMatch(/what they owe each month/);
    expect(await redirected(saveShare(person(monthlyBill, { share: "22.25" })))).toBe("/plan/shared?saved=person");
  });
});

describe("Add investment dated before the funding account has any entry", () => {
  it("refuses the transfer with the way out, and creates nothing", async () => {
    const { addInvestment } = await import("@/app/actions/investments");
    h.db.insert(transactions).values({ date: "2026-06-01", type: "income", amount: RM(100), accountId: main, item: "First" }).run();
    const before = h.db.select().from(accounts).all().length;
    const form = (date: string, over: Record<string, string> = {}) =>
      fd({ product: "other", name: "Fund", amount: "500", date, fromAccountId: String(main), recordTransfer: "on", ...over });
    const url = await redirected(addInvestment(form("2026-01-15")));
    expect(readable(url)).toMatch(/no entries before 2026-06-01/);
    expect(h.db.select().from(accounts).all()).toHaveLength(before);
    // Unticked, the investment is still added; on or after the first entry, the transfer is allowed.
    expect(await redirected(addInvestment(form("2026-01-15", { recordTransfer: "", name: "Fund A" })))).toBe("/invest?saved=investmentAdded");
    expect(await redirected(addInvestment(form("2026-06-01", { name: "Fund B" })))).toBe("/invest?saved=investmentAdded");
    expect(h.db.select().from(transactions).all().filter((t) => t.type === "transfer")).toHaveLength(1);
  });
});
