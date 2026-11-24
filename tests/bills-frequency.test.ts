import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/db/open";
import { accounts, categories, recurringBills } from "@/db/schema";
import {
  billsDueMax,
  dueInPeriod,
  dueMonths,
  evaluateBills,
  monthlyCommitments,
  nextDueDate,
  summarizeBills,
  toBudgetBills,
  type BillDef,
  type BillTx,
} from "@/lib/plan/bills";
import { billCaption, billTiles } from "@/lib/plan/bills-view";
import { billsPaidFrom, safeToSpend } from "@/lib/plan/safe";

const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const RM = (n: number) => Math.round(n * 100);
let nextId = 0;
const def = (name: string, rm: number, dueDay: number | null, over: Partial<BillDef> = {}): BillDef => ({
  id: ++nextId,
  name,
  accountId: 1,
  categoryId: null,
  nature: "need",
  amountMin: RM(rm),
  amountMax: RM(rm),
  dueDay,
  matchKeywords: null,
  active: true,
  ...over,
});
const yearly = (name: string, rm: number, dueDay: number | null, dueMonth: number, over: Partial<BillDef> = {}) => def(name, rm, dueDay, { frequency: "yearly", dueMonth, ...over });
const quarterly = (name: string, rm: number, dueDay: number | null, dueMonth: number, over: Partial<BillDef> = {}) => def(name, rm, dueDay, { frequency: "quarterly", dueMonth, ...over });

describe("which months a bill falls due in", () => {
  it("monthly: all twelve; yearly: its month; quarterly: its month and every 3 months on, wrapping the year", () => {
    expect(dueMonths({ frequency: "monthly", dueMonth: null })).toHaveLength(12);
    expect(dueMonths({})).toHaveLength(12);
    expect(dueMonths({ frequency: "yearly", dueMonth: 3 })).toEqual([3]);
    expect(dueMonths({ frequency: "quarterly", dueMonth: 3 })).toEqual([3, 6, 9, 12]);
    expect(dueMonths({ frequency: "quarterly", dueMonth: 11 })).toEqual([2, 5, 8, 11]);
  });
  it("a non-monthly bill with no valid month is treated as monthly rather than never due", () => {
    expect(dueMonths({ frequency: "yearly", dueMonth: null })).toHaveLength(12);
    expect(dueMonths({ frequency: "quarterly", dueMonth: 13 })).toHaveLength(12);
  });
});

describe("dueInPeriod", () => {
  it("a monthly bill is due in every period", () => {
    expect(dueInPeriod(def("Rent", 1, 1), { start: "2026-10-26", end: "2026-11-25" })).toBe(true);
    expect(dueInPeriod(def("Rent", 1, null), { start: "2026-10-26", end: "2026-11-25" })).toBe(true);
  });
  it("a pay cycle straddling two months catches a yearly bill by its due DAY", () => {
    const road = yearly("Road tax", 90, 5, 11); // 5 November
    expect(dueInPeriod(road, { start: "2026-10-26", end: "2026-11-25" })).toBe(true);
    expect(dueInPeriod(road, { start: "2026-11-26", end: "2026-12-25" })).toBe(false);
    expect(dueInPeriod(road, { start: "2026-09-26", end: "2026-10-25" })).toBe(false);
    // due on the 28th of November: that is the NEXT cycle, even though the first one touches November
    const late = yearly("Insurance", 900, 28, 11);
    expect(dueInPeriod(late, { start: "2026-10-26", end: "2026-11-25" })).toBe(false);
    expect(dueInPeriod(late, { start: "2026-11-26", end: "2026-12-25" })).toBe(true);
    // a yearly bill due in October on the 20th belongs to the cycle ending 25 Oct, not the one starting 26 Oct
    const oct = yearly("Licence", 30, 20, 10);
    expect(dueInPeriod(oct, { start: "2026-09-26", end: "2026-10-25" })).toBe(true);
    expect(dueInPeriod(oct, { start: "2026-10-26", end: "2026-11-25" })).toBe(false);
  });
  it("calendar months work the same way", () => {
    const road = yearly("Road tax", 90, 15, 3);
    expect(dueInPeriod(road, { start: "2027-03-01", end: "2027-03-31" })).toBe(true);
    expect(dueInPeriod(road, { start: "2027-02-01", end: "2027-02-28" })).toBe(false);
    expect(dueInPeriod(road, { start: "2027-04-01", end: "2027-04-30" })).toBe(false);
  });
  it("crosses the year boundary: a January bill is in the cycle that runs from December, never twice", () => {
    const jan = yearly("Assessment", 200, 10, 1);
    const cycles = [
      { start: "2026-11-26", end: "2026-12-25" },
      { start: "2026-12-26", end: "2027-01-25" },
      { start: "2027-01-26", end: "2027-02-25" },
    ];
    expect(cycles.map((c) => dueInPeriod(jan, c))).toEqual([false, true, false]);
  });
  it("quarterly: due in its month and every 3 months on, across the year boundary", () => {
    const q = quarterly("Quit rent", 150, 10, 11); // 10 Feb, 10 May, 10 Aug, 10 Nov
    const months = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];
    const due = months.filter((m) => dueInPeriod(q, { start: `${m}-01`, end: `${m}-28` }));
    expect(due).toEqual(["2026-08", "2026-11", "2027-02"]);
    const dec = quarterly("Service charge", 300, 28, 12); // 28 Mar, Jun, Sep, Dec
    expect(dueInPeriod(dec, { start: "2026-12-26", end: "2027-01-25" })).toBe(true); // 28 Dec
    expect(dueInPeriod(dec, { start: "2027-01-26", end: "2027-02-25" })).toBe(false);
    expect(dueInPeriod(dec, { start: "2027-02-26", end: "2027-03-25" })).toBe(false); // 28 Mar is the next cycle
    expect(dueInPeriod(dec, { start: "2027-03-26", end: "2027-04-25" })).toBe(true);
  });
  it("a short February month clamps the due day", () => {
    expect(dueInPeriod(yearly("x", 1, 31, 2), { start: "2027-02-01", end: "2027-02-28" })).toBe(true);
  });
  it("with no due day a bill counts on the 1st, so each date has one cycle", () => {
    const b = yearly("Renewal", 100, null, 11);
    expect(dueInPeriod(b, { start: "2026-10-26", end: "2026-11-25" })).toBe(true); // holds 1 Nov
    expect(dueInPeriod(b, { start: "2026-11-26", end: "2026-12-25" })).toBe(false);
  });
});

describe("nextDueDate", () => {
  it("finds the next one, even in the next year", () => {
    const road = yearly("Road tax", 90, 5, 3);
    expect(nextDueDate(road, "2026-10-26")).toBe("2027-03-05");
    expect(nextDueDate(road, "2027-03-05")).toBe("2027-03-05");
    expect(nextDueDate(road, "2027-03-06")).toBe("2028-03-05");
    expect(nextDueDate(quarterly("q", 1, 10, 3), "2026-10-26")).toBe("2026-12-10");
    expect(nextDueDate(def("m", 1, 10), "2026-10-26")).toBe("2026-11-10");
  });
});

describe("evaluateBills with yearly and quarterly bills", () => {
  const cycle = { start: "2026-09-28", end: "2026-10-27" };
  const today = "2026-10-09";
  const rent = def("Rent", 1000, 1);
  const road = yearly("Road tax", 90, 15, 3);
  const dueYearly = yearly("Insurance", 1200, 20, 10);
  const pay = (date: string, rm: number, o: Partial<BillTx> = {}): BillTx => ({ id: 1, date, amount: RM(rm), type: "expense", accountId: 1, item: null, billId: null, ...o });

  it("holds nothing back for a bill that is not due this cycle, and says when it next is", () => {
    const [i] = evaluateBills([road], cycle, [], today);
    expect(i).toMatchObject({ status: "not_due", due: false, reserve: 0, dueDate: null, daysUntilDue: null, nextDue: "2027-03-15" });
  });
  it("reserves the full amount in the cycle it falls due, and calls it overdue once past", () => {
    const [i] = evaluateBills([dueYearly], cycle, [], today);
    expect(i).toMatchObject({ status: "upcoming", due: true, reserve: RM(1200), dueDate: "2026-10-20", nextDue: null });
    const [late] = evaluateBills([dueYearly], cycle, [], "2026-10-25");
    expect(late.status).toBe("overdue");
    expect(late.reserve).toBe(RM(1200));
  });
  it("Mark paid still works on a bill that is not due: it shows paid, matched by bill id", () => {
    const [i] = evaluateBills([road], cycle, [pay("2026-10-05", 92, { billId: road.id })], today);
    expect(i).toMatchObject({ status: "paid", reserve: 0, paid: { amount: RM(92) } });
  });
  it("a yearly bill paid in its month shows paid for that period (matched by name)", () => {
    const [i] = evaluateBills([road], { start: "2027-02-26", end: "2027-03-25" }, [pay("2027-03-12", 90, { item: "Road tax" })], "2027-03-20");
    expect(i).toMatchObject({ status: "paid", due: true, reserve: 0 });
  });
  it("the summary, the tiles and the budgets leave out a bill that is not due", () => {
    const items = evaluateBills([rent, road, dueYearly], cycle, [], today);
    expect(summarizeBills(items)).toMatchObject({ count: 2, paidCount: 0, remaining: RM(2200), expectedTotal: RM(2200) });
    expect(billTiles(items, today)).toMatchObject({ count: 2, month: RM(2200), remaining: RM(2200) });
    expect(toBudgetBills(items)).toHaveLength(2);
    // but once the road tax is paid it is part of the picture
    const paid = evaluateBills([rent, road], cycle, [pay("2026-10-05", 92, { billId: road.id })], today);
    expect(toBudgetBills(paid)).toHaveLength(2);
    expect(summarizeBills(paid)).toMatchObject({ count: 2, paidCount: 1, paidTotal: RM(92) });
  });
  it("lists the not-due bill last", () => {
    expect(evaluateBills([road, rent], cycle, [], today).map((i) => i.bill.name)).toEqual(["Rent", "Road tax"]);
  });
});

describe("monthly figures spread a yearly bill over the year", () => {
  it("counts a yearly bill as a twelfth and a quarterly one as a third a month, and the full amount in the year", () => {
    const c = monthlyCommitments([def("Rent", 1000, 1), yearly("Road tax", 1200, 5, 3), quarterly("Quit rent", 300, 5, 2), def("Netflix", 50, 8, { nature: "want" }), yearly("Magazine", 120, null, 6, { nature: "want" })]);
    expect(c.monthly).toBe(RM(1000 + 100 + 100 + 50 + 10));
    expect(c.annual).toBe(RM(12_000 + 1200 + 1200 + 600 + 120));
    expect(c.discretionaryMonthly).toBe(RM(60));
    expect(c.discretionaryAnnual).toBe(RM(720));
    expect(c.count).toBe(5);
  });
  it("all-monthly data is unchanged: the sum of the midpoints and twelve times it", () => {
    const c = monthlyCommitments([def("A", 100.5, 1), def("B", 33.33, 2, { amountMax: RM(40), nature: "want" })]);
    expect(c.monthly).toBe(RM(100.5) + Math.round((RM(33.33) + RM(40)) / 2));
    expect(c.annual).toBe(c.monthly * 12);
    expect(c.discretionaryAnnual).toBe(c.discretionaryMonthly * 12);
  });
  it("the payday plan sets aside only the bills due in the cycle", () => {
    const bills = [def("Rent", 1000, 1), yearly("Road tax", 1200, 5, 11), yearly("Licence", 40, 5, 3), def("Gone", 99, 1, { active: false })];
    expect(billsDueMax(bills, { start: "2026-10-26", end: "2026-11-25" })).toBe(RM(2200));
    expect(billsDueMax(bills, { start: "2026-11-26", end: "2026-12-25" })).toBe(RM(1000));
  });
});

describe("safe to spend and the payday split are unchanged for monthly-only bills", () => {
  // Hand-computed fixture (the same figures as before yearly bills existed): rent 950-980 on the 1st, Netflix 88.90 on the 8th,
  // insurance 120 on the 20th, all paid from account 1; cycle 28 Sep - 27 Oct, today 9 Oct, RM 2,000 in the account.
  const cycle = { start: "2026-09-28", end: "2026-10-27" };
  const bills = [
    def("Rent", 950, 1, { amountMax: RM(980) }),
    def("Netflix", 88.9, 8),
    def("Insurance", 120, 20),
    def("Gym", 50, 3, { active: false }),
  ];
  it("reserve is the sum of the highest amounts of the unpaid ones", () => {
    const items = evaluateBills(bills, cycle, [], "2026-10-09");
    expect(items.map((i) => [i.bill.name, i.status, i.reserve])).toEqual([
      ["Rent", "overdue", 98_000],
      ["Netflix", "overdue", 8_890],
      ["Insurance", "upcoming", 12_000],
    ]);
    const s = safeToSpend({ accountName: "Bank", balance: 200_000, items: billsPaidFrom(items, 1), daysLeft: 19 });
    expect(s).toMatchObject({ reserve: 118_890, safe: 81_110, perDay: 4269, unpaidCount: 3, overdueCount: 2 });
    expect(billsDueMax(bills, cycle)).toBe(98_000 + 8_890 + 12_000);
    expect(summarizeBills(items)).toMatchObject({ count: 3, paidCount: 0, overdueCount: 2, remaining: 118_890, expectedTotal: 96_500 + 8_890 + 12_000 });
  });
  it("adding a yearly bill that is not due changes nothing", () => {
    const items = evaluateBills([...bills, yearly("Road tax", 90, 15, 3)], cycle, [], "2026-10-09");
    const s = safeToSpend({ accountName: "Bank", balance: 200_000, items: billsPaidFrom(items, 1), daysLeft: 19 });
    expect(s).toMatchObject({ reserve: 118_890, safe: 81_110, perDay: 4269, unpaidCount: 3, overdueCount: 2 });
  });
});

describe("billCaption", () => {
  it("says how often and which month; not-due bills say when they are next due", () => {
    const road = yearly("Road tax", 90, 15, 3);
    expect(billCaption(road, { account: "Bank", dueDate: null, nextDue: "2027-03-15" })).toBe("Bank · Once a year · next due in March");
    expect(billCaption(road, { dueDate: "2027-03-15" })).toBe("Once a year · March · due 15 Mar");
    expect(billCaption(quarterly("q", 50, 10, 2), { dueDate: "2026-11-10" })).toBe("Every 3 months · February, May, August, November · due 10 Nov");
  });
  it("monthly captions are exactly as before", () => {
    expect(billCaption(def("Rent", 1100, 1), { account: "Maybank", dueDate: "2026-11-01" })).toBe("Maybank · due 1 Nov");
    expect(billCaption({ amountMin: 1, amountMax: 1, dueDay: null, frequency: "monthly", dueMonth: null }, {})).toBe("no due day");
  });
});

describe("saveBill and the plan (real actions, in-memory database)", () => {
  const fd = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  const redirected = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m.startsWith("NEXT_REDIRECT:")) return decodeURIComponent(m.slice("NEXT_REDIRECT:".length).replaceAll("+", " "));
      throw e;
    }
  };
  let main: number, subs: number;
  beforeEach(async () => {
    const { openDb } = await import("@/db/open");
    h.db = openDb(":memory:");
    main = h.db.select().from(accounts).all().find((a) => a.type === "bank")!.id;
    subs = h.db.select().from(categories).all().find((c) => c.name === "Subscriptions")!.id;
  });
  const form = (o: Record<string, string> = {}) => fd({ name: "Road tax", categoryId: String(subs), accountId: String(main), amountMin: "90", dueDay: "15", active: "on", ...o });
  const rows = () => h.db.select().from(recurringBills).all();

  it("a form without the new fields is a monthly bill, as before", async () => {
    const { saveBill } = await import("@/app/actions/plan");
    await redirected(saveBill(form()));
    expect(rows()[0]).toMatchObject({ frequency: "monthly", dueMonth: null });
  });
  it("saves a yearly and a quarterly bill with their month", async () => {
    const { saveBill } = await import("@/app/actions/plan");
    expect(await redirected(saveBill(form({ frequency: "yearly", dueMonth: "3" })))).toBe("/plan/bills?saved=bill");
    await redirected(saveBill(form({ name: "Quit rent", frequency: "quarterly", dueMonth: "11" })));
    expect(rows().map((r) => [r.name, r.frequency, r.dueMonth])).toEqual([
      ["Road tax", "yearly", 3],
      ["Quit rent", "quarterly", 11],
    ]);
  });
  it("refuses a non-monthly bill without a valid month, and an unknown frequency", async () => {
    const { saveBill } = await import("@/app/actions/plan");
    expect(await redirected(saveBill(form({ frequency: "yearly" })))).toMatch(/month the bill is due/);
    expect(await redirected(saveBill(form({ frequency: "yearly", dueMonth: "13" })))).toMatch(/month the bill is due/);
    expect(await redirected(saveBill(form({ frequency: "quarterly", dueMonth: "0" })))).toMatch(/month the bill is due/);
    expect(await redirected(saveBill(form({ frequency: "weekly", dueMonth: "3" })))).toMatch(/how often/);
    expect(rows()).toHaveLength(0);
  });
  it("switching back to monthly clears the month", async () => {
    const { saveBill } = await import("@/app/actions/plan");
    await redirected(saveBill(form({ frequency: "yearly", dueMonth: "3" })));
    await redirected(saveBill(form({ id: String(rows()[0].id), frequency: "monthly", dueMonth: "3" })));
    expect(rows()[0]).toMatchObject({ frequency: "monthly", dueMonth: null });
  });
  it("getPlan reserves a yearly bill only in the cycle it falls due, and Mark paid still works on the others", async () => {
    const { saveBill, payBill } = await import("@/app/actions/plan");
    const { getPlan } = await import("@/lib/queries/plan");
    await redirected(saveBill(form({ name: "Rent", dueDay: "1", amountMin: "100" })));
    await redirected(saveBill(form({ name: "Licence", frequency: "yearly", dueMonth: "3", amountMin: "40" })));
    await redirected(saveBill(form({ name: "Insurance", frequency: "yearly", dueMonth: "10", dueDay: "9", amountMin: "500" })));
    const before = await getPlan("2026-10-09");
    const byName = Object.fromEntries(before.bills.map((b) => [b.bill.name, b]));
    expect(byName.Licence).toMatchObject({ status: "not_due", reserve: 0 });
    expect(byName.Insurance.due).toBe(true); // 9 Oct is in the cycle that holds today
    expect(before.planner.bills).toBe(RM(600)); // rent + insurance, not the licence
    expect(before.summary.count).toBe(2);
    const licence = rows().find((r) => r.name === "Licence")!;
    await redirected(payBill(fd({ billId: String(licence.id), amount: "41", date: "2026-10-09" })));
    const after = await getPlan("2026-10-09");
    expect(after.bills.find((b) => b.bill.name === "Licence")).toMatchObject({ status: "paid", reserve: 0 });
    expect(after.summary).toMatchObject({ count: 3, paidCount: 1 });
    expect(after.commitments.monthly).toBe(RM(100 + 500 / 12 + 40 / 12)); // 100 + 41.67 + 3.33
  });
});
