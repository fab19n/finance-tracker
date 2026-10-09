import { describe, expect, it } from "vitest";
import { normalizeName } from "@/lib/plan/bills";
import { planPayday, roundToFifty } from "@/lib/plan/payday";
import { cycleFlow, estimateAllowance, type CycleFlow, type FlowContext, type FlowTx } from "@/lib/plan/savings-flow";

const RM = (n: number) => Math.round(n * 100);

describe("planPayday - your numbers", () => {
  const base = { income: RM(5400), bills: RM(2467.7), allowance: RM(1000), buffer: RM(100) };

  it("keeps bills + allowance + buffer in the main account and moves only the rest to savings", () => {
    const p = planPayday(base);
    expect(p.keepInMain).toBe(RM(3567.7));
    expect(p.moveToSavings).toBe(RM(1832.3));
    expect(p.deficit).toBe(0);
    expect(p.savingsRate).toBeCloseTo(0.3393, 3);
  });

  it("shows what the usual RM 4,200 habit really does", () => {
    const p = planPayday({ ...base, usualTransfer: RM(4200) });
    expect(p.usual).toMatchObject({
      leftInMain: RM(1200),
      billsGap: RM(1267.7), // the bills alone need this much pulled back
      leftForEveryday: RM(-1267.7), // nothing left for groceries, fuel, food...
    });
    // bills gap + the whole everyday allowance also has to come back out
    expect(p.usual!.takenBackAtLeast).toBe(RM(1267.7) + RM(1000));
    // ...so the transfer that "felt like" RM 4,200 of saving is really RM 4,200 - 2,267.70 = RM 1,932.30
    expect(RM(4200) - p.usual!.takenBackAtLeast).toBe(RM(1932.3));
  });

  it("a usual transfer small enough to cover everything produces no gap", () => {
    const p = planPayday({ ...base, usualTransfer: RM(1500) });
    expect(p.usual).toMatchObject({ billsGap: 0, leftForEveryday: RM(1432.3), takenBackAtLeast: 0 });
  });

  it("reports a deficit when the plan doesn't fit the income", () => {
    const p = planPayday({ ...base, income: RM(3000) });
    expect(p.moveToSavings).toBe(0);
    expect(p.deficit).toBe(RM(567.7));
  });

  it("has no savings rate without income", () => {
    expect(planPayday({ ...base, income: 0 }).savingsRate).toBeNull();
  });

  it("rounds suggestions to RM 50", () => {
    expect(roundToFifty(RM(1234))).toBe(RM(1250));
    expect(roundToFifty(RM(1224))).toBe(RM(1200));
  });
});

describe("cycleFlow - separating a planning gap from overspending", () => {
  const MAIN = 1;
  const SAVINGS = 2;
  const ctx: FlowContext = { spendingId: MAIN, savingsId: SAVINGS, billNames: new Set([normalizeName("Netflix")]) };
  const range = { start: "2026-08-28", end: "2026-09-27", complete: true };
  let id = 0;
  const tx = (o: Partial<FlowTx> & Pick<FlowTx, "date" | "type" | "amount">): FlowTx => ({
    id: ++id,
    accountId: MAIN,
    toAccountId: null,
    billId: null,
    item: null,
    ...o,
  });

  // The classic pattern: RM5,400 in, RM4,200 moved to savings, RM2,467.70 of bills, then top-ups from savings.
  const story: FlowTx[] = [
    tx({ date: "2026-08-28", type: "income", amount: RM(5400), item: "Salary" }),
    tx({ date: "2026-08-28", type: "transfer", amount: RM(4200), toAccountId: SAVINGS }),
    tx({ date: "2026-09-01", type: "expense", amount: RM(965), billId: 1 }),
    tx({ date: "2026-09-05", type: "expense", amount: RM(1502.7), billId: 2 }), // the other bills, lumped
    tx({ date: "2026-09-10", type: "expense", amount: RM(900), item: "groceries, fuel, TnG" }),
    tx({ date: "2026-09-02", type: "transfer", amount: RM(1267.7), accountId: SAVINGS, toAccountId: MAIN }), // top-up for bills
    tx({ date: "2026-09-12", type: "transfer", amount: RM(900), accountId: SAVINGS, toAccountId: MAIN }), // top-up for everyday
  ];

  it("splits the top-ups into what the payday split forced and what everyday spending caused", () => {
    const f = cycleFlow(range, story, ctx);
    expect(f).toMatchObject({
      income: RM(5400),
      deposited: RM(4200),
      drawn: RM(2167.7),
      billsPaid: RM(2467.7),
      variable: RM(900),
      leftAfterDeposit: RM(1200),
      planningGap: RM(1267.7), // 2,467.70 of bills - 1,200 left behind
      everydayFromSavings: RM(900),
    });
  });

  it("reveals the real saving: what savings grew by equals income - bills - everyday spending", () => {
    const f = cycleFlow(range, story, ctx);
    expect(f.netSaved).toBe(RM(4200) - RM(2167.7)); // RM 2,032.30
    expect(f.trueSaved).toBe(RM(5400) - RM(2467.7) - RM(900));
    expect(f.netSaved).toBe(f.trueSaved); // the two views agree when everything is logged
    expect(f.trueRate).toBeCloseTo(0.3764, 3);
  });

  it("recognises a bill typed by name even without a link", () => {
    const f = cycleFlow(range, [tx({ date: "2026-09-03", type: "expense", amount: RM(88.9), item: "NETFLIX" })], ctx);
    expect(f.billsPaid).toBe(RM(88.9));
    expect(f.variable).toBe(0);
  });

  it("no top-ups means no gap and no everyday-from-savings", () => {
    const f = cycleFlow(range, story.filter((t) => !(t.accountId === SAVINGS)), ctx);
    expect(f).toMatchObject({ drawn: 0, planningGap: 0, everydayFromSavings: 0 });
  });

  it("when what was left behind covers the bills, ALL top-ups are everyday spending", () => {
    const rich: FlowTx[] = [
      tx({ date: "2026-08-28", type: "income", amount: RM(5400) }),
      tx({ date: "2026-08-28", type: "transfer", amount: RM(1000), toAccountId: SAVINGS }),
      tx({ date: "2026-09-01", type: "expense", amount: RM(2000), billId: 1 }),
      tx({ date: "2026-09-12", type: "transfer", amount: RM(300), accountId: SAVINGS, toAccountId: MAIN }),
    ];
    expect(cycleFlow(range, rich, ctx)).toMatchObject({ planningGap: 0, everydayFromSavings: RM(300) });
  });

  it("ignores anything outside the cycle", () => {
    const f = cycleFlow(range, [tx({ date: "2026-09-28", type: "expense", amount: RM(50) }), tx({ date: "2026-08-27", type: "expense", amount: RM(50) })], ctx);
    expect(f.variable).toBe(0);
  });

  describe("spending paid straight from the savings account", () => {
    const fromSavings = (o: Partial<FlowTx> & Pick<FlowTx, "date" | "amount">) => tx({ type: "expense", accountId: SAVINGS, ...o });
    const mixed: FlowTx[] = [
      tx({ date: "2026-08-28", type: "income", amount: RM(5400) }),
      tx({ date: "2026-08-28", type: "transfer", amount: RM(4200), toAccountId: SAVINGS }),
      fromSavings({ date: "2026-09-02", amount: RM(965), billId: 1, category: "Rent / Housing" }), // rent: a bill, from savings
      fromSavings({ date: "2026-09-04", amount: RM(440), item: "Netflix", category: "Subscriptions" }), // a bill typed by name
      fromSavings({ date: "2026-09-08", amount: RM(120), item: "groceries", category: "Groceries" }),
      fromSavings({ date: "2026-09-09", amount: RM(30), item: "lunch", category: "Eating Out" }),
      tx({ date: "2026-09-05", type: "expense", amount: RM(800), billId: 2 }), // a bill paid from the SPENDING account
      tx({ date: "2026-09-10", type: "expense", amount: RM(100), item: "fuel" }), // everyday, from spending
      tx({ date: "2026-09-12", type: "transfer", amount: RM(300), accountId: SAVINGS, toAccountId: MAIN }),
    ];

    it("totals what left savings directly, biggest categories first", () => {
      const f = cycleFlow(range, mixed, ctx);
      expect(f.spentFromSavings).toBe(RM(965 + 440 + 120 + 30));
      expect(f.savingsSpendTop).toEqual([
        { name: "Rent / Housing", amount: RM(965) },
        { name: "Subscriptions", amount: RM(440) },
        { name: "Groceries", amount: RM(120) },
      ]); // top three only
    });

    it("bills paid from savings don't make the payday split look too small", () => {
      const f = cycleFlow(range, mixed, ctx);
      expect(f.billsPaid).toBe(RM(965 + 440 + 800));
      expect(f.billsFromSpending).toBe(RM(800)); // only this has to be covered by what stayed in the spending account
      // 1,200 left behind covers the 800: so the 300 top-up is everyday spending, not a planning gap
      expect(f).toMatchObject({ planningGap: 0, everydayFromSavings: RM(300) });
    });

    it("an account with no roles has nothing paid 'from savings'", () => {
      expect(cycleFlow(range, mixed, { ...ctx, savingsId: null }).spentFromSavings).toBe(0);
    });
  });

  describe("paydayDeposit: what you move at payday, not one-offs later in the cycle", () => {
    const base = [tx({ date: "2026-08-28", type: "income", amount: RM(5400) })];
    const move = (date: string, rm: number) => tx({ date, type: "transfer", amount: RM(rm), toAccountId: SAVINGS });

    it("counts the first week only", () => {
      const f = cycleFlow(range, [...base, move("2026-08-28", 4700), move("2026-09-09", 1400)], ctx); // a final payslip moved on day 13
      expect(f.deposited).toBe(RM(6100));
      expect(f.paydayDeposit).toBe(RM(4700));
    });
    it("adds two transfers in the same week", () => {
      expect(cycleFlow(range, [...base, move("2026-08-28", 3000), move("2026-09-02", 1500)], ctx).paydayDeposit).toBe(RM(4500));
    });
    it("falls back to everything moved if nothing was moved in the first week", () => {
      expect(cycleFlow(range, [...base, move("2026-09-15", 2000)], ctx).paydayDeposit).toBe(RM(2000));
    });
    it("is zero when nothing was moved", () => {
      expect(cycleFlow(range, base, ctx).paydayDeposit).toBe(0);
    });
  });

  it("without account roles set, it still totals spending but cannot see transfers", () => {
    const f = cycleFlow(range, story, { ...ctx, spendingId: null, savingsId: null });
    expect(f).toMatchObject({ deposited: 0, drawn: 0, planningGap: 0 });
    expect(f.billsPaid).toBe(RM(2467.7));
  });
});

describe("estimateAllowance", () => {
  const flow = (variable: number, over: Partial<CycleFlow> = {}): CycleFlow => ({
    start: "x", end: "y", complete: true, income: RM(5400), deposited: 0, drawn: 0, billsPaid: 0, billsFromSpending: 0, variable: RM(variable),
    spentFromSavings: 0, savingsSpendTop: [], paydayDeposit: 0,
    leftAfterDeposit: 0, planningGap: 0, everydayFromSavings: 0, netSaved: 0, trueSaved: 0, trueRate: null, ...over,
  });
  it("averages up to the last three completed cycles to the nearest RM 50", () => {
    expect(estimateAllowance([flow(900), flow(1100), flow(1020), flow(5000)])).toBe(RM(1000));
  });
  it("skips the cycle in progress and cycles with no income", () => {
    expect(estimateAllowance([flow(5000, { complete: false }), flow(5000, { income: 0 }), flow(800)])).toBe(RM(800));
  });
  it("returns null with nothing to learn from", () => {
    expect(estimateAllowance([])).toBeNull();
  });
});
