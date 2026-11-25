import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, categories, importRules, recurringBills, transactions } from "@/db/schema";

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

let main: number, savings: number, rentCat: number, subsCat: number, incomeCat: number;

beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  main = h.db.select().from(accounts).all().find((a) => a.type === "bank")!.id;
  const cats = h.db.select().from(categories).all();
  rentCat = cats.find((c) => c.name === "Rent / Housing")!.id;
  subsCat = cats.find((c) => c.name === "Subscriptions")!.id;
  incomeCat = cats.find((c) => c.name === "Salary")!.id;
  // Roles are given through the real action, the way Settings does it.
  const { saveAccount } = await import("@/app/actions/settings");
  await redirected(saveAccount(fd({ id: String(main), name: "Salary & Bills", type: "bank", openingBalance: "0", purpose: "spending" })));
  await redirected(saveAccount(fd({ name: "Savings", type: "bank", openingBalance: "0", purpose: "savings" })));
  savings = h.db.select().from(accounts).all().find((a) => a.name === "Savings")!.id;
});

const bill = (over: Record<string, string> = {}) =>
  fd({ name: "Netflix", categoryId: String(subsCat), accountId: String(main), amountMin: "88.90", dueDay: "8", active: "on", ...over });
const bills = () => h.db.select().from(recurringBills).all();
const txs = () => h.db.select().from(transactions).all();

describe("account roles", () => {
  it("a role belongs to one account: giving it to another takes it from the first", async () => {
    const { saveAccount } = await import("@/app/actions/settings");
    const roles = () => Object.fromEntries(h.db.select().from(accounts).all().map((a) => [a.name, a.purpose]));
    expect(roles()).toMatchObject({ "Salary & Bills": "spending", Savings: "savings" });
    await redirected(saveAccount(fd({ id: String(savings), name: "Savings", type: "bank", openingBalance: "0", purpose: "spending" })));
    expect(roles()).toMatchObject({ "Salary & Bills": null, Savings: "spending" });
  });
  it("an edit form that doesn't send a role leaves the existing one alone", async () => {
    const { saveAccount } = await import("@/app/actions/settings");
    await redirected(saveAccount(fd({ id: String(main), name: "Renamed", type: "bank", openingBalance: "0" })));
    expect(h.db.select().from(accounts).where(eq(accounts.id, main)).get()).toMatchObject({ name: "Renamed", purpose: "spending" });
  });
  it("choosing 'No special role' clears it", async () => {
    const { saveAccount } = await import("@/app/actions/settings");
    await redirected(saveAccount(fd({ id: String(main), name: "x", type: "bank", openingBalance: "0", purpose: "" })));
    expect(h.db.select().from(accounts).where(eq(accounts.id, main)).get()!.purpose).toBeNull();
  });
});

describe("saveBill / deleteBill", () => {
  it("a fixed bill has min = max; keywords are normalised; a blank due day means 'not set'", async () => {
    const { saveBill } = await import("@/app/actions/plan");
    expect(await redirected(saveBill(bill({ dueDay: "", matchKeywords: " Netflix ,  SPOTIFY,, " })))).toBe("/plan/bills?saved=bill");
    expect(bills()[0]).toMatchObject({ name: "Netflix", amountMin: RM(88.9), amountMax: RM(88.9), dueDay: null, matchKeywords: "netflix, spotify", active: true });
  });

  it("a varying bill stores its range (rent 950-980)", async () => {
    const { saveBill } = await import("@/app/actions/plan");
    await redirected(saveBill(bill({ name: "Rent", categoryId: String(rentCat), amountMin: "950", amountMax: "980", dueDay: "1" })));
    expect(bills()[0]).toMatchObject({ amountMin: RM(950), amountMax: RM(980), dueDay: 1 });
  });

  it("an unticked 'Active' pauses the bill; editing updates in place", async () => {
    const { saveBill } = await import("@/app/actions/plan");
    await redirected(saveBill(bill()));
    const id = bills()[0].id;
    const edit = bill({ id: String(id), amountMin: "95" });
    edit.delete("active"); // an unticked checkbox simply isn't sent
    await redirected(saveBill(edit));
    expect(bills()).toHaveLength(1);
    expect(bills()[0]).toMatchObject({ amountMin: RM(95), active: false });
  });

  it.each([
    ["no name", { name: " " }, /name/],
    ["no amount", { amountMin: "" }, /amount/],
    ["'up to' below the amount", { amountMin: "100", amountMax: "50" }, /can't be less/],
    ["a due day of 32", { dueDay: "32" }, /between 1 and 31/],
    ["an income category", { categoryId: "SALARY" }, /expense category/],
    ["an investment account", { accountId: "INVEST" }, /bank, cash or e-wallet/],
  ])("rejects %s and saves nothing", async (_l, over, message) => {
    const { saveBill } = await import("@/app/actions/plan");
    const inv = h.db.insert(accounts).values({ name: "FD", type: "investment" }).returning().get();
    const o = { ...over } as Record<string, string>;
    if (o.categoryId === "SALARY") o.categoryId = String(incomeCat);
    if (o.accountId === "INVEST") o.accountId = String(inv.id);
    expect(readable(await redirected(saveBill(bill(o))))).toMatch(message);
    expect(bills()).toHaveLength(0);
  });

  it("deleting a bill keeps its payments as ordinary spending and drops its import rules", async () => {
    const { saveBill, deleteBill, payBill } = await import("@/app/actions/plan");
    await redirected(saveBill(bill()));
    const id = bills()[0].id;
    await redirected(payBill(fd({ billId: String(id), amount: "88.90", date: "2026-10-08" })));
    h.db.insert(importRules).values({ pattern: "netflix", kind: "expense", billId: id }).run();
    await redirected(deleteBill(fd({ id: String(id) })));
    expect(bills()).toHaveLength(0);
    expect(txs()).toHaveLength(1);
    expect(txs()[0].billId).toBeNull();
    expect(h.db.select().from(importRules).all()).toHaveLength(0);
  });
});

describe("payBill / recordSalary / recordPaydayTransfer", () => {
  it("'Mark paid' records spending from the bill's account, in its category, linked to the bill", async () => {
    const { saveBill, payBill } = await import("@/app/actions/plan");
    await redirected(saveBill(bill()));
    const b = bills()[0];
    expect(await redirected(payBill(fd({ billId: String(b.id), amount: "88.90", date: "2026-10-08" })))).toBe("/plan?saved=billPaid");
    expect(txs()).toMatchObject([{ type: "expense", amount: RM(88.9), accountId: main, categoryId: subsCat, item: "Netflix", billId: b.id, date: "2026-10-08" }]);
  });
  it("rejects a missing bill or bad amount", async () => {
    const { payBill } = await import("@/app/actions/plan");
    expect(readable(await redirected(payBill(fd({ billId: "999", amount: "10", date: "2026-10-08" }))))).toMatch(/no longer exists/);
    expect(readable(await redirected(payBill(fd({ billId: "1", amount: "zero", date: "2026-10-08" }))))).toMatch(/amount you paid/);
    expect(txs()).toHaveLength(0);
  });

  it("recordSalary books income in the Salary category into the spending account", async () => {
    const { recordSalary } = await import("@/app/actions/plan");
    await redirected(recordSalary(fd({ amount: "5,400", date: "2026-09-28" })));
    expect(txs()).toMatchObject([{ type: "income", amount: RM(5400), accountId: main, categoryId: incomeCat, item: "Salary" }]);
  });
  it("recordSalary and recordPaydayTransfer explain what's missing when roles aren't set", async () => {
    const { recordSalary, recordPaydayTransfer } = await import("@/app/actions/plan");
    h.db.update(accounts).set({ purpose: null }).run();
    expect(readable(await redirected(recordSalary(fd({ amount: "5400", date: "2026-09-28" }))))).toMatch(/spending account in Settings/);
    expect(readable(await redirected(recordPaydayTransfer(fd({ amount: "1800", date: "2026-09-28" }))))).toMatch(/spending and savings accounts/);
    expect(txs()).toHaveLength(0);
  });
  it("recordPaydayTransfer moves money from spending to savings as a transfer", async () => {
    const { recordPaydayTransfer } = await import("@/app/actions/plan");
    await redirected(recordPaydayTransfer(fd({ amount: "1,800", date: "2026-09-28" })));
    expect(txs()).toMatchObject([{ type: "transfer", amount: RM(1800), accountId: main, toAccountId: savings }]);
  });
});

describe("a double tap records once", () => {
  it("'Mark paid' twice for the same bill, day and amount adds one entry and says so", async () => {
    const { saveBill, payBill } = await import("@/app/actions/plan");
    await redirected(saveBill(bill()));
    const b = bills()[0];
    const pay = (over: Record<string, string> = {}) => payBill(fd({ billId: String(b.id), amount: "88.90", date: "2026-10-08", ...over }));
    expect(await redirected(pay())).toBe("/plan?saved=billPaid");
    expect(readable(await redirected(pay()))).toMatch(/Already recorded/);
    expect(txs()).toHaveLength(1);
    // a different amount or day is a different payment
    await redirected(pay({ amount: "90" }));
    await redirected(pay({ date: "2026-11-08" }));
    expect(txs()).toHaveLength(3);
  });
  it("'Record salary' twice for the same day and amount adds one entry", async () => {
    const { recordSalary } = await import("@/app/actions/plan");
    await redirected(recordSalary(fd({ amount: "5400", date: "2026-09-28" })));
    expect(readable(await redirected(recordSalary(fd({ amount: "5400", date: "2026-09-28" }))))).toMatch(/Already recorded/);
    expect(txs()).toHaveLength(1);
    await redirected(recordSalary(fd({ amount: "5400", date: "2026-10-28" })));
    expect(txs()).toHaveLength(2);
  });
  it("'I moved it' twice for the same day and amount adds one transfer", async () => {
    const { recordPaydayTransfer } = await import("@/app/actions/plan");
    await redirected(recordPaydayTransfer(fd({ amount: "1800", date: "2026-09-28" })));
    expect(readable(await redirected(recordPaydayTransfer(fd({ amount: "1800", date: "2026-09-28" }))))).toMatch(/Already recorded/);
    expect(txs()).toHaveLength(1);
    await redirected(recordPaydayTransfer(fd({ amount: "1900", date: "2026-09-28" })));
    expect(txs()).toHaveLength(2);
  });
});

describe("the double-tap guard only covers moments ago", () => {
  it("a same-day same-amount payment recorded earlier does not block a genuine second one", async () => {
    const { saveBill, payBill } = await import("@/app/actions/plan");
    await redirected(saveBill(bill()));
    const b = bills()[0];
    const pay = () => payBill(fd({ billId: String(b.id), amount: "88.90", date: "2026-10-08" }));
    await redirected(pay());
    h.db.run(sql`UPDATE transactions SET created_at = datetime('now', '-10 minutes')`);
    expect(await redirected(pay())).toBe("/plan?saved=billPaid");
    expect(txs()).toHaveLength(2);
  });
});

describe("what deleting a bill takes with it", () => {
  it("counts the payments, people, turns and import rules per bill", async () => {
    const { saveBill, payBill } = await import("@/app/actions/plan");
    const { getBillUsage } = await import("@/lib/queries/bill-usage");
    const { billShares, billTurns } = await import("@/db/schema");
    await redirected(saveBill(bill()));
    await redirected(saveBill(bill({ name: "Spotify" })));
    const [a, b] = bills();
    await redirected(payBill(fd({ billId: String(a.id), amount: "88.90", date: "2026-10-08" })));
    const p = h.db.insert(billShares).values({ billId: a.id, name: "Sam", share: 500, startMonth: "2026-01" }).returning().get();
    h.db.insert(billShares).values({ billId: a.id, name: "Lee", share: 500, startMonth: "2026-01" }).run();
    h.db.insert(billTurns).values([{ billId: a.id, month: "2026-10", shareId: p.id }, { billId: a.id, month: "2026-11", shareId: null }]).run();
    h.db.insert(importRules).values({ pattern: "netflix", kind: "expense", billId: a.id }).run();
    const usage = await getBillUsage();
    expect(usage.get(a.id)).toEqual({ payments: 1, people: 2, turns: 2, rules: 1 });
    expect(usage.get(b.id)).toBeUndefined();
  });
});

describe("cycle settings", () => {
  it("stores payday, pay, allowance, buffer and the savings rate; blank money fields mean 'not set'", async () => {
    const { saveCycleSettings } = await import("@/app/actions/settings");
    const { getSettings } = await import("@/lib/settings");
    await redirected(saveCycleSettings(fd({ paydayDay: "30", expectedIncome: "5,400", variableAllowance: "", cycleBuffer: "150", savingsRatePct: "2.5" })));
    expect(await getSettings()).toMatchObject({ paydayDay: 30, expectedIncome: RM(5400), variableAllowance: 0, cycleBuffer: RM(150), savingsRatePct: 2.5 });
  });
  it("stores Home's daily limit in sen; blank turns it off, and a form without the field leaves it alone", async () => {
    const { saveCycleSettings } = await import("@/app/actions/settings");
    const { getSettings } = await import("@/lib/settings");
    const save = (over: Record<string, string>) => redirected(saveCycleSettings(fd({ paydayDay: "28", savingsRatePct: "1", ...over })));
    expect((await getSettings()).dailyLimit).toBe(0);
    await save({ dailyLimit: "52.50" });
    expect((await getSettings()).dailyLimit).toBe(RM(52.5));
    await save({});
    expect((await getSettings()).dailyLimit).toBe(RM(52.5));
    await save({ dailyLimit: "" });
    expect((await getSettings()).dailyLimit).toBe(0);
  });
  it("refuses a daily limit it can't read, and saves nothing from that form", async () => {
    const { saveCycleSettings } = await import("@/app/actions/settings");
    const { getSettings } = await import("@/lib/settings");
    await redirected(saveCycleSettings(fd({ paydayDay: "28", savingsRatePct: "1", dailyLimit: "50" })));
    for (const dailyLimit of ["fifty", "-5", "1.234", "999999999999"]) {
      expect(await redirected(saveCycleSettings(fd({ paydayDay: "20", savingsRatePct: "1", dailyLimit }))), dailyLimit).toMatch(/error=/);
    }
    expect(await getSettings()).toMatchObject({ dailyLimit: RM(50), paydayDay: 28 });
  });
  it("rejects an impossible payday day and bad amounts, saving nothing", async () => {
    const { saveCycleSettings } = await import("@/app/actions/settings");
    const { getSettings, DEFAULT_SETTINGS } = await import("@/lib/settings");
    expect(await redirected(saveCycleSettings(fd({ paydayDay: "45", savingsRatePct: "1" })))).toMatch(/error=/);
    expect(readable(await redirected(saveCycleSettings(fd({ paydayDay: "28", expectedIncome: "lots", savingsRatePct: "1" }))))).toMatch(/RM amounts/);
    expect((await getSettings()).paydayDay).toBe(DEFAULT_SETTINGS.paydayDay);
  });
});

describe("getPlan - a full payday-split scenario", () => {
  async function scenario() {
    const { saveBill, payBill, recordSalary, recordPaydayTransfer } = await import("@/app/actions/plan");
    await redirected(saveBill(bill({ name: "Rent", categoryId: String(rentCat), amountMin: "950", amountMax: "980", dueDay: "1" })));
    await redirected(saveBill(bill({ name: "Netflix", dueDay: "8" })));
    await redirected(saveBill(bill({ name: "Parents electricity", categoryId: String(rentCat), amountMin: "65", amountMax: "75", dueDay: "" })));
    await redirected(recordSalary(fd({ amount: "5400", date: "2026-09-28" })));
    await redirected(recordPaydayTransfer(fd({ amount: "4200", date: "2026-09-28" })));
    const rent = bills().find((b) => b.name === "Rent")!;
    await redirected(payBill(fd({ billId: String(rent.id), amount: "965", date: "2026-10-01" })));
    const { getPlan } = await import("@/lib/queries/plan");
    return getPlan("2026-10-09");
  }

  it("works out the cycle from the recorded salary", async () => {
    const plan = await scenario();
    expect(plan.hasSalary).toBe(true);
    expect(plan.cycle).toMatchObject({ start: "2026-09-28", end: "2026-10-27", nextPayday: "2026-10-28", daysLeft: 19, source: "salary" });
  });

  it("safe to spend = what's in the spending account minus the bills still to pay", async () => {
    const { safe } = await scenario();
    // 5,400 in - 4,200 to savings - 965 rent = RM 235.00 left.  Still to pay: Netflix 88.90 + electricity (up to) 75.
    expect(safe).toMatchObject({ configured: true, accountName: "Salary & Bills", balance: RM(235), reserve: RM(88.9 + 75), unpaidCount: 2, overdueCount: 1 });
    expect(safe.safe).toBe(RM(235 - 163.9));
    expect(safe.perDay).toBe(Math.round(RM(71.1) / 19));
  });

  it("looking at the spending account on its own gives the very same safe-to-spend, from the same maths", async () => {
    const plan = await scenario();
    const { safeToSpend, billsPaidFrom } = await import("@/lib/plan/safe");
    expect(safeToSpend({ accountName: "Salary & Bills", balance: RM(235), items: billsPaidFrom(plan.bills, main), daysLeft: plan.cycle.daysLeft })).toEqual(plan.safe);
  });

  it("another account's outlook counts only the bills paid from IT", async () => {
    const { saveBill } = await import("@/app/actions/plan");
    await redirected(saveBill(bill({ name: "Insurance", accountId: String(savings), amountMin: "120", dueDay: "20" })));
    const plan = await scenario();
    const { getAccountBalances } = await import("@/lib/queries/accounts");
    const { safeToSpend, billsPaidFrom } = await import("@/lib/plan/safe");
    const balance = (await getAccountBalances()).find((a) => a.id === savings)!.balance;
    expect(balance).toBe(RM(4200)); // what the payday move put there
    const mine = billsPaidFrom(plan.bills, savings);
    expect(mine.map((i) => i.bill.name)).toEqual(["Insurance"]);
    // 4,200 - the 120 insurance still to pay; the spending account's three bills do not touch it
    expect(safeToSpend({ accountName: "Savings", balance, items: mine, daysLeft: plan.cycle.daysLeft })).toMatchObject({ reserve: RM(120), safe: RM(4080), unpaidCount: 1, overdueCount: 0 });
    // and the spending account's own card is unchanged by it
    expect(plan.safe.reserve).toBe(RM(88.9 + 75));
  });

  it("goes negative - and says so - when bills outrun the account", async () => {
    const { recordPaydayTransfer } = await import("@/app/actions/plan");
    await redirected(recordPaydayTransfer(fd({ amount: "200", date: "2026-10-02" })));
    const { getPlan } = await import("@/lib/queries/plan");
    const { safe } = await getPlan("2026-10-09");
    expect(safe.safe).toBeLessThan(0);
  });

  it("checklist statuses: rent paid, Netflix overdue (due the 8th), electricity has no due day", async () => {
    const plan = await scenario();
    const status = Object.fromEntries(plan.bills.map((b) => [b.bill.name, b.status]));
    expect(status).toEqual({ Rent: "paid", Netflix: "overdue", "Parents electricity": "unscheduled" });
    expect(plan.summary).toMatchObject({ paidCount: 1, count: 3 });
  });

  it("feeds the planner: pay from the salary, bills at their HIGHEST amounts, usual transfer = the payday move you've made", async () => {
    const { planner } = await scenario();
    // The payday move is known the day it is made, so it doesn't wait for the cycle to finish.
    expect(planner).toMatchObject({ income: RM(5400), incomeFrom: "salary", bills: RM(980 + 88.9 + 75), allowance: 0, usualTransfer: RM(4200) });
  });

  it("the usual transfer is unknown before any payday move has been made", async () => {
    const { recordSalary } = await import("@/app/actions/plan");
    await redirected(recordSalary(fd({ amount: "5400", date: "2026-09-28" })));
    const { getPlan } = await import("@/lib/queries/plan");
    expect((await getPlan("2026-10-09")).planner.usualTransfer).toBeNull();
  });

  it("the savings check sees the payday transfer in the cycle in progress", async () => {
    const { flows } = await scenario();
    expect(flows[0]).toMatchObject({ complete: false, income: RM(5400), deposited: RM(4200), billsPaid: RM(965), drawn: 0 });
  });

  it("before any salary: falls back to the payday setting and still works", async () => {
    const { getPlan } = await import("@/lib/queries/plan");
    const plan = await getPlan("2026-10-09");
    expect(plan.hasSalary).toBe(false);
    expect(plan.cycle).toMatchObject({ source: "setting", start: "2026-09-28", nextPayday: "2026-10-28" });
    expect(plan.flows).toEqual([]);
    expect(plan.planner.incomeFrom).toBe("none");
  });

  it("without a spending account, safe-to-spend says it isn't configured", async () => {
    h.db.update(accounts).set({ purpose: null }).run();
    const { getPlan } = await import("@/lib/queries/plan");
    expect((await getPlan("2026-10-09")).safe.configured).toBe(false);
  });
});
