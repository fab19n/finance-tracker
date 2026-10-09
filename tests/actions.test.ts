import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, categories, holdings, settings as settingsTable, transactions, valuations } from "@/db/schema";

// Run the REAL server actions against a real in-memory database. Only the Next.js plumbing is stubbed:
// redirect() throws (as it does in Next), revalidatePath is a no-op, and the DB accessor returns our DB.
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

/** Await an action that ends in redirect(); return the URL it redirected to (or null if it returned). */
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

/** URLSearchParams writes spaces as "+", which decodeURIComponent alone leaves untouched. */
const readable = (url: string | null) => decodeURIComponent((url ?? "").replaceAll("+", " "));

let ids: { bank: number; cash: number; ewallet: number; food: number; salary: number; unaccounted: number; adjust: number };

beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  const a = h.db.select().from(accounts).all();
  const c = h.db.select().from(categories).all();
  ids = {
    bank: a.find((x) => x.type === "bank")!.id,
    cash: a.find((x) => x.type === "cash")!.id,
    ewallet: a.find((x) => x.type === "ewallet")!.id,
    food: c.find((x) => x.name === "Eating Out")!.id,
    salary: c.find((x) => x.name === "Salary")!.id,
    unaccounted: c.find((x) => x.name === "Unaccounted cash")!.id,
    adjust: c.find((x) => x.name === "Cash adjustment")!.id,
  };
  vi.unstubAllGlobals();
});

const txs = () => h.db.select().from(transactions).all();

describe("saveTransaction", () => {
  const expense = (over: Record<string, string> = {}) =>
    fd({ type: "expense", amount: "12.50", date: "2026-10-09", accountId: String(ids.cash), categoryId: String(ids.food), item: "  Teh tarik ", ...over });

  it("records an expense in exact sen, trimming the item", async () => {
    const { saveTransaction } = await import("@/app/actions/transactions");
    const r = await saveTransaction({ ok: false }, expense());
    expect(r).toMatchObject({ ok: true, message: "Saved" });
    expect(txs()).toMatchObject([{ type: "expense", amount: 1250, accountId: ids.cash, categoryId: ids.food, item: "Teh tarik", toAccountId: null }]);
  });

  it("records income and transfers (transfers carry no category)", async () => {
    const { saveTransaction } = await import("@/app/actions/transactions");
    await saveTransaction({ ok: false }, fd({ type: "income", amount: "6,500", date: "2026-10-01", accountId: String(ids.bank), categoryId: String(ids.salary) }));
    await saveTransaction({ ok: false }, fd({ type: "transfer", amount: "200", date: "2026-10-02", accountId: String(ids.bank), toAccountId: String(ids.cash), categoryId: String(ids.food) }));
    const [inc, tr] = txs();
    expect(inc).toMatchObject({ type: "income", amount: 650_000 });
    expect(tr).toMatchObject({ type: "transfer", amount: 20_000, toAccountId: ids.cash, categoryId: null });
  });

  it.each([
    ["a zero amount", { amount: "0" }, /amount greater than 0/i],
    ["a non-numeric amount", { amount: "abc" }, /amount greater than 0/i],
    ["a missing category", { categoryId: "" }, /Pick a category/],
    ["a bad date", { date: "tomorrow" }, /valid date/],
    ["a category of the wrong type", { categoryId: "SALARY" }, /doesn't match/],
    ["an account that doesn't exist", { accountId: "9999" }, /no longer exists/],
  ])("rejects %s without writing anything", async (_label, over, message) => {
    const { saveTransaction } = await import("@/app/actions/transactions");
    const o = { ...over } as Record<string, string>;
    if (o.categoryId === "SALARY") o.categoryId = String(ids.salary);
    const r = await saveTransaction({ ok: false }, expense(o));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(message);
    expect(txs()).toHaveLength(0);
  });

  it("rejects a transfer to the same account, or with no destination", async () => {
    const { saveTransaction } = await import("@/app/actions/transactions");
    const base = { type: "transfer", amount: "10", date: "2026-10-09", accountId: String(ids.bank) };
    expect((await saveTransaction({ ok: false }, fd({ ...base, toAccountId: String(ids.bank) }))).error).toMatch(/must differ/);
    expect((await saveTransaction({ ok: false }, fd({ ...base }))).error).toMatch(/goes to/);
    expect(txs()).toHaveLength(0);
  });

  it("editing (with an id) updates the row and redirects to the activity list", async () => {
    const { saveTransaction } = await import("@/app/actions/transactions");
    await saveTransaction({ ok: false }, expense());
    const id = txs()[0].id;
    const url = await redirected(saveTransaction({ ok: false }, expense({ id: String(id), amount: "15.00", item: "Latte" })));
    expect(url).toBe("/transactions");
    expect(txs()).toHaveLength(1);
    expect(txs()[0]).toMatchObject({ id, amount: 1500, item: "Latte" });
  });
});

describe("deleteTransaction", () => {
  it("removes only that row", async () => {
    const { saveTransaction, deleteTransaction } = await import("@/app/actions/transactions");
    const f = fd({ type: "expense", amount: "5", date: "2026-10-09", accountId: String(ids.cash), categoryId: String(ids.food) });
    await saveTransaction({ ok: false }, f);
    await saveTransaction({ ok: false }, f);
    const [a, b] = txs();
    await deleteTransaction(fd({ id: String(a.id) }));
    expect(txs().map((t) => t.id)).toEqual([b.id]);
    await deleteTransaction(fd({})); // no id: harmless
    expect(txs()).toHaveLength(1);
  });
});

describe("settings actions", () => {
  it("creates and edits accounts, including a negative opening balance (an overdraft)", async () => {
    const { saveAccount, toggleAccountArchived } = await import("@/app/actions/settings");
    expect(await redirected(saveAccount(fd({ name: "Maybank Savings", type: "bank", openingBalance: "1,500.50" })))).toBe("/settings");
    const created = h.db.select().from(accounts).all().find((x) => x.name === "Maybank Savings")!;
    expect(created.openingBalance).toBe(150_050);

    await redirected(saveAccount(fd({ id: String(created.id), name: "Maybank Overdraft", type: "bank", openingBalance: "-250" })));
    expect(h.db.select().from(accounts).where(eq(accounts.id, created.id)).get()).toMatchObject({ name: "Maybank Overdraft", openingBalance: -25_000 });

    await redirected(toggleAccountArchived(fd({ id: String(created.id), archived: "1" })));
    expect(h.db.select().from(accounts).where(eq(accounts.id, created.id)).get()!.archived).toBe(true);
  });

  it("rejects an unnamed account and a bad opening balance with an error in the URL", async () => {
    const { saveAccount } = await import("@/app/actions/settings");
    const before = h.db.select().from(accounts).all().length;
    expect(await redirected(saveAccount(fd({ name: " ", type: "bank" })))).toMatch(/^\/settings\?error=.*needs%20a%20name/);
    expect(await redirected(saveAccount(fd({ name: "X", type: "bank", openingBalance: "12.345" })))).toMatch(/error=.*valid%20amount/);
    expect(h.db.select().from(accounts).all()).toHaveLength(before);
  });

  it("creates a category with a monthly budget, and refuses to archive a system category", async () => {
    const { saveCategory, toggleCategoryArchived } = await import("@/app/actions/settings");
    await redirected(saveCategory(fd({ name: "Pets", type: "expense", nature: "want", icon: "🐶", color: "#aabbcc", monthlyBudget: "150" })));
    const pets = h.db.select().from(categories).all().find((x) => x.name === "Pets")!;
    expect(pets).toMatchObject({ nature: "want", monthlyBudget: 15_000, color: "#aabbcc" });

    expect(await redirected(toggleCategoryArchived(fd({ id: String(ids.unaccounted), archived: "1" })))).toMatch(/can't%20be%20archived/);
    expect(h.db.select().from(categories).where(eq(categories.id, ids.unaccounted)).get()!.archived).toBe(false);
    await redirected(toggleCategoryArchived(fd({ id: String(pets.id), archived: "1" })));
    expect(h.db.select().from(categories).where(eq(categories.id, pets.id)).get()!.archived).toBe(true);
  });

  it("income categories never keep a budget", async () => {
    const { saveCategory } = await import("@/app/actions/settings");
    await redirected(saveCategory(fd({ name: "Rental income", type: "income", nature: "saving", monthlyBudget: "999" })));
    expect(h.db.select().from(categories).all().find((x) => x.name === "Rental income")!.monthlyBudget).toBeNull();
  });

  it("saves investing assumptions and rejects out-of-range values without saving any", async () => {
    const { saveAssumptions } = await import("@/app/actions/settings");
    const { getSettings } = await import("@/lib/settings");
    await redirected(saveAssumptions(fd({ fdRatePct: "3.5", sp500ReturnPct: "8", emergencyMonths: "4", horizonYears: "15", riskProfile: "growth" })));
    expect(await getSettings()).toMatchObject({ fdRatePct: 3.5, sp500ReturnPct: 8, emergencyMonths: 4, horizonYears: 15, riskProfile: "growth" });

    expect(await redirected(saveAssumptions(fd({ fdRatePct: "300", sp500ReturnPct: "8", emergencyMonths: "4", horizonYears: "15", riskProfile: "growth" })))).toMatch(/error=/);
    expect((await getSettings()).fdRatePct).toBe(3.5);
    expect(h.db.select().from(settingsTable).all()).toHaveLength(5);
  });
});

describe("investment actions", () => {
  it("opens a fixed deposit: account + terms + the funding transfer out of the bank", async () => {
    const { addInvestment } = await import("@/app/actions/investments");
    const url = await redirected(
      addInvestment(
        fd({ product: "fixed_deposit", name: "Maybank FD 12M", amount: "10,000", date: "2026-10-01", fromAccountId: String(ids.bank), annualRatePct: "3.05", maturityDate: "2027-10-01", compounding: "simple", recordTransfer: "on" }),
      ),
    );
    expect(url).toBe("/invest");
    const acc = h.db.select().from(accounts).all().find((x) => x.name === "Maybank FD 12M")!;
    expect(acc.type).toBe("investment");
    expect(h.db.select().from(holdings).where(eq(holdings.accountId, acc.id)).get()).toMatchObject({ product: "fixed_deposit", principal: 1_000_000, annualRatePct: 3.05, startDate: "2026-10-01", maturityDate: "2027-10-01", compounding: "simple" });
    expect(txs()).toMatchObject([{ type: "transfer", amount: 1_000_000, accountId: ids.bank, toAccountId: acc.id }]);

    const { listInvestments } = await import("@/lib/queries/investments");
    const [inv] = await listInvestments("2026-10-01");
    expect(inv).toMatchObject({ invested: 1_000_000, value: 1_000_000 });
    expect(inv.fd).toMatchObject({ maturityValue: 1_030_500, daysToMaturity: 365 });
  });

  it("skips the transfer when the box is unticked", async () => {
    const { addInvestment } = await import("@/app/actions/investments");
    await redirected(addInvestment(fd({ product: "sp500_etf", name: "VOO", amount: "500", date: "2026-10-01", fromAccountId: String(ids.bank) })));
    expect(txs()).toHaveLength(0);
  });

  it.each([
    ["an FD without a rate", { annualRatePct: "" }, /interest rate/],
    ["an FD maturing before it starts", { maturityDate: "2026-01-01" }, /after the start date/],
    ["an FD without a principal", { amount: "" }, /principal/],
    ["no name", { name: " " }, /name/],
  ])("rejects %s and creates nothing", async (_l, over, message) => {
    const { addInvestment } = await import("@/app/actions/investments");
    const before = h.db.select().from(accounts).all().length;
    const base = { product: "fixed_deposit", name: "FD", amount: "1000", date: "2026-10-01", fromAccountId: String(ids.bank), annualRatePct: "3", maturityDate: "2027-10-01" };
    expect(readable(await redirected(addInvestment(fd({ ...base, ...over }))))).toMatch(message);
    expect(h.db.select().from(accounts).all()).toHaveLength(before);
  });

  async function makeEtf() {
    const { addInvestment } = await import("@/app/actions/investments");
    await redirected(addInvestment(fd({ product: "sp500_etf", name: "VOO", ticker: "VOO", units: "2", amount: "1000", date: "2026-09-01", fromAccountId: String(ids.bank), recordTransfer: "on" })));
    return h.db.select().from(accounts).all().find((x) => x.name === "VOO")!;
  }

  it("records a value per day, overwriting (not duplicating) when re-entered", async () => {
    const { recordValuation } = await import("@/app/actions/investments");
    const etf = await makeEtf();
    await redirected(recordValuation(fd({ accountId: String(etf.id), value: "1,050.00", date: "2026-10-01" })));
    await redirected(recordValuation(fd({ accountId: String(etf.id), value: "1,075.25", date: "2026-10-01" })));
    const rows = h.db.select().from(valuations).where(eq(valuations.accountId, etf.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ value: 107_525, source: "manual" });
    expect(await redirected(recordValuation(fd({ accountId: String(etf.id), value: "lots", date: "2026-10-01" })))).toMatch(/error=/);
  });

  it("adds and withdraws money as transfers in the right direction (never as spending)", async () => {
    const { recordInvestmentFlow } = await import("@/app/actions/investments");
    const etf = await makeEtf();
    await redirected(recordInvestmentFlow(fd({ accountId: String(etf.id), fromAccountId: String(ids.bank), amount: "300", date: "2026-10-05", direction: "in" })));
    await redirected(recordInvestmentFlow(fd({ accountId: String(etf.id), fromAccountId: String(ids.bank), amount: "100", date: "2026-10-06", direction: "out" })));
    const [, inFlow, outFlow] = txs();
    expect(inFlow).toMatchObject({ type: "transfer", accountId: ids.bank, toAccountId: etf.id, amount: 30_000 });
    expect(outFlow).toMatchObject({ type: "transfer", accountId: etf.id, toAccountId: ids.bank, amount: 10_000 });
    expect(txs().every((t) => t.type === "transfer")).toBe(true);
    const { listInvestments } = await import("@/lib/queries/investments");
    expect((await listInvestments("2026-10-09"))[0].invested).toBe(100_000 + 30_000 - 10_000);
  });

  it("updateHolding sets the ticker and units; archiveInvestment hides it from the portfolio", async () => {
    const { updateHolding, archiveInvestment } = await import("@/app/actions/investments");
    const { listInvestments } = await import("@/lib/queries/investments");
    const etf = await makeEtf();
    await redirected(updateHolding(fd({ accountId: String(etf.id), ticker: "CSPX.L", units: "3.5", priceCurrency: "GBP" })));
    expect(h.db.select().from(holdings).where(eq(holdings.accountId, etf.id)).get()).toMatchObject({ ticker: "CSPX.L", units: 3.5, priceCurrency: "GBP" });
    expect(await redirected(updateHolding(fd({ accountId: String(etf.id), ticker: "X", units: "-1" })))).toMatch(/error=/);

    expect(await listInvestments("2026-10-09")).toHaveLength(1);
    await redirected(archiveInvestment(fd({ accountId: String(etf.id) })));
    expect(await listInvestments("2026-10-09")).toHaveLength(0);
  });
});

describe("refreshPrices (network stubbed)", () => {
  const yahoo = (price: number, currency = "USD") => ({
    ok: true,
    json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: price, currency, regularMarketTime: 1_791_489_600 } }] } }),
  });
  const fx = (rate: number) => ({ ok: true, json: async () => ({ rates: { MYR: rate } }) });

  async function etfWithUnits(units: string, currency = "USD") {
    const { addInvestment } = await import("@/app/actions/investments");
    await redirected(addInvestment(fd({ product: "sp500_etf", name: "VOO", ticker: "VOO", units, priceCurrency: currency, amount: "1000", date: "2026-09-01", fromAccountId: String(ids.bank) })));
    return h.db.select().from(accounts).all().find((x) => x.name === "VOO")!;
  }

  it("stores units x price x FX in sen as today's valuation", async () => {
    const { refreshPrices } = await import("@/app/actions/investments");
    const etf = await etfWithUnits("2");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("yahoo") ? yahoo(700) : fx(4.1))));
    const url = await redirected(refreshPrices());
    expect(url).toBe("/invest?priced=1");
    // 2 units x $700 x 4.10 = RM 5,740.00
    expect(h.db.select().from(valuations).where(eq(valuations.accountId, etf.id)).all()).toMatchObject([{ value: 574_000, source: "price" }]);
  });

  it("converts pence-quoted London listings (GBp) correctly", async () => {
    const { refreshPrices } = await import("@/app/actions/investments");
    const etf = await etfWithUnits("10", "GBP");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("yahoo") ? yahoo(8_000, "GBp") : fx(6))));
    await redirected(refreshPrices());
    // 10 units x 8,000p (= GBP 80) x 6.00 = RM 4,800.00
    expect(h.db.select().from(valuations).where(eq(valuations.accountId, etf.id)).get()!.value).toBe(480_000);
  });

  it("fails gracefully: reports the problem, writes nothing, and says manual entry still works", async () => {
    const { refreshPrices } = await import("@/app/actions/investments");
    const etf = await etfWithUnits("2");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const url = readable(await redirected(refreshPrices()));
    expect(url).toMatch(/priced=0/);
    expect(url).toMatch(/Couldn't reach the price service for VOO/);
    expect(url).toMatch(/update the value by hand/);
    expect(h.db.select().from(valuations).where(eq(valuations.accountId, etf.id)).all()).toHaveLength(0);
  });

  it("tells you what's missing when no holding has a ticker and units", async () => {
    const { refreshPrices } = await import("@/app/actions/investments");
    expect(readable(await redirected(refreshPrices()))).toMatch(/ticker and the number of units/);
  });

  it("rejects ticker symbols that don't look like tickers before making any request", async () => {
    const { fetchQuote } = await import("@/lib/investing/prices");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(fetchQuote("VOO/../../etc")).rejects.toThrow(/doesn't look like a ticker/);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("reconcileCashAction", () => {
  async function withCash() {
    const { saveTransaction } = await import("@/app/actions/transactions");
    await saveTransaction({ ok: false }, fd({ type: "transfer", amount: "200", date: "2026-10-01", accountId: String(ids.bank), toAccountId: String(ids.cash) }));
    await saveTransaction({ ok: false }, fd({ type: "expense", amount: "50", date: "2026-10-02", accountId: String(ids.cash), categoryId: String(ids.food) }));
    // Cash in Hand: opening 0 + 200 - 50 = RM 150 on the books
  }

  it("a shortfall is booked as 'Unaccounted cash' spending, bringing the books to what you counted", async () => {
    const { reconcileCashAction } = await import("@/app/actions/cash");
    await withCash();
    expect(await redirected(reconcileCashAction(fd({ accountId: String(ids.cash), actual: "120.00" })))).toBe("/insights?recon=shortfall&amt=3000#cash");
    const last = txs().at(-1)!;
    expect(last).toMatchObject({ type: "expense", amount: 3000, accountId: ids.cash, categoryId: ids.unaccounted, item: "Cash reconciliation" });
    const { getAccountBalances } = await import("@/lib/queries/accounts");
    expect((await getAccountBalances()).find((a) => a.id === ids.cash)!.balance).toBe(12_000);
    const { getCashStatus } = await import("@/lib/queries/cash");
    expect((await getCashStatus(new Date().toISOString().slice(0, 10))).unaccounted90).toBe(3000);
  });

  it("a surplus is booked as a cash adjustment (income), a match writes nothing", async () => {
    const { reconcileCashAction } = await import("@/app/actions/cash");
    await withCash();
    expect(await redirected(reconcileCashAction(fd({ accountId: String(ids.cash), actual: "160" })))).toBe("/insights?recon=surplus&amt=1000#cash");
    expect(txs().at(-1)).toMatchObject({ type: "income", amount: 1000, categoryId: ids.adjust });
    const n = txs().length;
    expect(await redirected(reconcileCashAction(fd({ accountId: String(ids.cash), actual: "160" })))).toBe("/insights?recon=match&amt=0#cash");
    expect(txs()).toHaveLength(n);
  });

  it("refuses a bad amount and non-cash accounts", async () => {
    const { reconcileCashAction } = await import("@/app/actions/cash");
    expect(await redirected(reconcileCashAction(fd({ accountId: String(ids.cash), actual: "lots" })))).toBe("/insights?recon=invalid#cash");
    expect(await redirected(reconcileCashAction(fd({ accountId: String(ids.bank), actual: "10" })))).toBe("/insights?recon=invalid#cash");
    expect(txs()).toHaveLength(0);
  });
});
