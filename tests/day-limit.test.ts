import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/db/open";
import { accounts, categories, recurringBills, transactions } from "@/db/schema";
import { wholeDayShown } from "@/components/activity/filter-logic";
import { billPaymentsByPeriod, calendarStart, dailyLeftOutIds, dailySpend } from "@/lib/analytics/daily-spend";
import { limitStanding } from "@/lib/analytics/dashboard-text";
import { periodsWithin, resolvePeriod } from "@/lib/analytics/periods";
import { shiftDays } from "@/lib/dates";

// Real queries on an in-memory database; only the connection is stubbed.
const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));

const RM = (n: number) => Math.round(n * 100);
const plain = (s: string) => s.replace(/ /g, " ");

describe("where a day stands against the limit", () => {
  it("says over, exactly, under or nothing, with the figures", () => {
    expect([RM(50), RM(43), RM(10), 0].map((spent) => plain(limitStanding(spent, RM(43))))).toEqual([
      "Over your RM 43.00 limit by RM 7.00",
      "Exactly your RM 43.00 limit",
      "RM 33.00 under your RM 43.00 limit",
      "Nothing counts towards your RM 43.00 limit",
    ]);
  });
});

describe("when Activity shows one whole day", () => {
  const raw = { type: "", account: "", category: "", q: "", min: "", max: "" };
  const day = { from: "2026-11-09", to: "2026-11-09" };
  it("is the day when the list starts and ends on it, showing everything or spending only", () => {
    expect(wholeDayShown(day, raw)).toBe("2026-11-09");
    expect(wholeDayShown(day, { ...raw, type: "expense" })).toBe("2026-11-09");
  });
  it("is nothing for a longer range, an open end, or a list narrowed some other way", () => {
    expect(wholeDayShown({ from: "2026-11-09", to: "2026-11-10" }, raw)).toBeNull();
    expect(wholeDayShown({ from: "2026-11-09" }, raw)).toBeNull();
    expect(wholeDayShown({}, raw)).toBeNull();
    for (const narrowed of [{ type: "income" }, { type: "transfer" }, { account: "1" }, { category: "2" }, { q: "teh" }, { min: "5" }, { max: "50" }]) {
      expect(wholeDayShown(day, { ...raw, ...narrowed }), JSON.stringify(narrowed)).toBeNull();
    }
  });
});

describe("dayAgainstLimit", () => {
  const today = "2026-11-25";
  const settings = { dailyLimit: RM(43), paydayDay: 26, dailyLeftOutCategories: [] as number[], dailyCountedNeeds: [] as number[] };

  beforeEach(async () => {
    const { openDb } = await import("@/db/open");
    h.db = openDb(":memory:");
    const main = h.db.select().from(accounts).all().find((a) => a.type === "bank")!.id;
    const cats = h.db.select().from(categories).all();
    const id = (name: string) => cats.find((c) => c.name === name)!.id;
    settings.dailyLeftOutCategories = [id("Subscriptions")];
    const spend = (date: string, amount: number, category: string, item: string, billId?: number) =>
      h.db.insert(transactions).values({ date, type: "expense", amount, accountId: main, categoryId: id(category), item, billId }).run();
    // Salaries on the 26th, so Home opens on pay cycles.
    for (const date of ["2026-08-26", "2026-09-26", "2026-10-26"]) {
      h.db.insert(transactions).values({ date, type: "income", amount: RM(5000), accountId: main, categoryId: id("Salary") }).run();
    }
    // A bill in a category that DOES count, so only the bill rule can leave its payments out.
    const bill = h.db
      .insert(recurringBills)
      .values({ name: "Cinema club", categoryId: id("Entertainment"), accountId: main, amountMin: RM(30), amountMax: RM(30), dueDay: 5 })
      .returning()
      .get().id;
    for (let date = "2026-09-01"; date <= today; date = shiftDays(date, 1)) {
      const day = Number(date.slice(8, 10));
      if (day % 2 === 0) spend(date, RM(day), "Eating Out", "Lunch");
      if (day % 3 === 0) spend(date, RM(12), "Groceries", "Market");
      if (day === 7) spend(date, RM(55), "Subscriptions", "Plan");
    }
    spend("2026-09-28", RM(30), "Entertainment", "Cinema club"); // paid, never linked: recognised by name
    spend("2026-10-03", RM(30), "Entertainment", "Cinema club"); // a second one in that cycle is ordinary spending
    spend("2026-11-02", RM(30), "Entertainment", "Cinema club", bill); // linked
  });

  it("gives the very figure that shaded each square on Home, bill payments recognised by name included", async () => {
    const { listFlowRows } = await import("@/lib/queries/analytics");
    const { listBills, listSalaries } = await import("@/lib/queries/plan");
    const { listCategories } = await import("@/lib/queries/reference");
    const { dayAgainstLimit } = await import("@/lib/queries/daily");

    // Home's own steps: the weeks up to the end of the period on screen.
    const salaryDates = (await listSalaries()).map((s) => s.date);
    const choice = resolvePeriod({ today, salaryDates, paydayDay: settings.paydayDay });
    expect(choice.view).toBe("cycle");
    const from = calendarStart(choice.end);
    const spans = periodsWithin({ view: choice.view, today, salaryDates, paydayDay: settings.paydayDay, from, to: choice.end });
    const rows = await listFlowRows(spans.reduce((first, p) => (p.start < first ? p.start : first), from), choice.end);
    const home = dailySpend(rows, {
      start: from,
      end: choice.end,
      today,
      limit: settings.dailyLimit,
      bills: billPaymentsByPeriod(await listBills(), spans, rows, today),
      leftOutCategoryIds: dailyLeftOutIds(await listCategories(true), settings.dailyLeftOutCategories, settings.dailyCountedNeeds),
    });

    for (const square of home.days.filter((d) => d.date >= "2026-09-01" && d.date <= today)) {
      expect(await dayAgainstLimit(square.date, today, settings), square.date).toEqual(square);
    }
    // And the cases that matter are really in there.
    expect(await dayAgainstLimit("2026-09-28", today, settings)).toMatchObject({ spent: RM(28), leftOut: RM(30) });
    expect(await dayAgainstLimit("2026-11-02", today, settings)).toMatchObject({ spent: RM(2), leftOut: RM(30) });
    // The 7th: the left-out category only. The 12th: lunch counts, the Need (groceries) doesn't.
    expect(await dayAgainstLimit("2026-11-07", today, settings)).toMatchObject({ spent: 0, leftOut: RM(55), level: 0 });
    expect(await dayAgainstLimit("2026-11-12", today, settings)).toMatchObject({ spent: RM(12), leftOut: RM(12) });
  });
});
