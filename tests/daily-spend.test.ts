import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { billPaymentsByPeriod, CALENDAR_WEEKS, calendarStart, dailyLeftOutIds, dailySpend, dayLevel } from "@/lib/analytics/daily-spend";
import { daySquareText } from "@/lib/analytics/dashboard-text";
import { toBudgetBills, evaluateBills, asBillTxs, type BillDef } from "@/lib/plan/bills";
import type { FlowRow } from "@/lib/analytics/summary";
import { formatRM } from "@/lib/money";

const RM = (n: number) => Math.round(n * 100);
const LIMIT = RM(50);

let nextId = 1;
const row = (date: string, amount: number, over: Partial<FlowRow> = {}): FlowRow => ({
  id: nextId++,
  date,
  type: "expense",
  amount: RM(amount),
  categoryId: 1,
  categoryName: "Food",
  categoryIcon: "",
  nature: "need",
  isSystem: false,
  item: "lunch",
  accountId: 1,
  billId: null,
  ...over,
});

/** A pay cycle, 26 Oct (a Monday) to 25 Nov 2026 (a Wednesday): 31 days over two months. */
const CYCLE = { start: "2026-10-26", end: "2026-11-25", today: "2026-11-10", limit: LIMIT };
const on = (r: ReturnType<typeof dailySpend>, date: string) => r.days.find((d) => d.date === date)!;
const over = (r: ReturnType<typeof dailySpend>) => r.days.filter((d) => d.level === "over").map((d) => d.date);

describe("dayLevel", () => {
  it("steps up a quarter of the limit at a time and turns over only past it", () => {
    expect(dayLevel(0, LIMIT)).toBe(0);
    expect(dayLevel(1, LIMIT)).toBe(1);
    expect(dayLevel(RM(12.5), LIMIT)).toBe(1);
    expect(dayLevel(RM(12.51), LIMIT)).toBe(2);
    expect(dayLevel(RM(25), LIMIT)).toBe(2);
    expect(dayLevel(RM(25.01), LIMIT)).toBe(3);
    expect(dayLevel(RM(37.5), LIMIT)).toBe(3);
    expect(dayLevel(RM(37.51), LIMIT)).toBe(4);
    expect(dayLevel(LIMIT, LIMIT)).toBe(4); // spending the limit is not exceeding it
    expect(dayLevel(LIMIT + 1, LIMIT)).toBe("over");
  });
  it("holds for a limit that doesn't divide by four", () => {
    // RM 0.10: quarters fall at 2.5, 5 and 7.5 sen.
    expect([1, 2, 3, 5, 6, 7, 8, 10, 11].map((s) => dayLevel(s, 10))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, "over"]);
  });
});

describe("dailyLeftOutIds", () => {
  const cats = [
    { id: 1, type: "expense", nature: "need" },
    { id: 2, type: "expense", nature: "need" },
    { id: 3, type: "expense", nature: "want" },
    { id: 4, type: "expense", nature: "want" },
    { id: 5, type: "income", nature: "need" },
  ];
  it("leaves out every Need without being told, and other categories only when ticked", () => {
    expect(dailyLeftOutIds(cats, [], [])).toEqual([1, 2]);
    expect(dailyLeftOutIds(cats, [4], [])).toEqual([1, 2, 4]);
  });
  it("counts a Need you chose to count, even if an older list still names it", () => {
    expect(dailyLeftOutIds(cats, [2, 4], [2])).toEqual([1, 4]);
  });
  it("never lists income or a category that doesn't exist", () => {
    expect(dailyLeftOutIds(cats, [5, 99], [])).toEqual([1, 2]);
  });
});

describe("dailySpend", () => {
  it("gives every day of the period once, in order, adding up what was spent on each", () => {
    const r = dailySpend([row("2026-10-26", 10), row("2026-10-26", 5.5), row("2026-11-25", 70)], { ...CYCLE, today: "2026-11-25" });
    expect(r.days).toHaveLength(31);
    expect([r.days[0].date, r.days.at(-1)!.date]).toEqual(["2026-10-26", "2026-11-25"]);
    expect(on(r, "2026-10-26")).toMatchObject({ spent: RM(15.5), level: 2 });
    expect(on(r, "2026-11-25")).toMatchObject({ spent: RM(70), level: "over" });
    expect(on(r, "2026-11-01")).toMatchObject({ spent: 0, level: 0 });
    expect(over(r)).toEqual(["2026-11-25"]);
  });

  it("judges the day's total, not each entry", () => {
    const r = dailySpend([row("2026-11-02", 30), row("2026-11-02", 30)], CYCLE);
    expect(on(r, "2026-11-02")).toMatchObject({ spent: RM(60), level: "over" });
  });

  it("ignores income and anything outside the period", () => {
    const r = dailySpend([row("2026-10-25", 99), row("2026-11-26", 99), row("2026-11-02", 5000, { type: "income" })], CYCLE);
    expect(r.days.every((d) => d.spent === 0 && d.leftOut === 0)).toBe(true);
  });

  it("leaves a linked bill payment out of the total, and keeps count of it", () => {
    const r = dailySpend([row("2026-11-01", 1200, { billId: 7 }), row("2026-11-01", 20)], CYCLE);
    expect(on(r, "2026-11-01")).toMatchObject({ spent: RM(20), leftOut: RM(1200), level: 2 });
    expect(over(r)).toEqual([]);
  });

  it("leaves out every entry in a left-out category, bill or not, and keeps count of it", () => {
    const rows = [row("2026-11-02", 400, { categoryId: 6 }), row("2026-11-02", 90, { categoryId: 12 }), row("2026-11-02", 30, { categoryId: 1 })];
    expect(on(dailySpend(rows, { ...CYCLE, leftOutCategoryIds: [6, 12] }), "2026-11-02")).toMatchObject({ spent: RM(30), leftOut: RM(490), level: 3 });
    // With nothing chosen they all count.
    expect(on(dailySpend(rows, CYCLE), "2026-11-02")).toMatchObject({ spent: RM(520), leftOut: 0, level: "over" });
  });

  it("counts a bill payment in a left-out category once, and an entry with no category as spending", () => {
    const r = dailySpend([row("2026-11-02", 55, { categoryId: 12, billId: 3 }), row("2026-11-02", 10, { categoryId: null })], { ...CYCLE, leftOutCategoryIds: [12] });
    expect(on(r, "2026-11-02")).toMatchObject({ spent: RM(10), leftOut: RM(55) });
  });

  it("leaves out EVERY linked payment, even a second one of the same bill", () => {
    const r = dailySpend([row("2026-11-01", 60, { billId: 7 }), row("2026-11-02", 60, { billId: 7 })], CYCLE);
    expect(over(r)).toEqual([]);
  });

  it("leaves out an unlinked payment the Plan's checklist counts as paying a bill", () => {
    const netflix: BillDef = {
      id: 3, name: "Netflix", accountId: 1, categoryId: 1, nature: "want",
      amountMin: RM(55.9), amountMax: RM(55.9), dueDay: 8, matchKeywords: null, active: true,
    };
    const rows = [row("2026-11-08", 55.9, { item: "Netflix" }), row("2026-11-08", 4)];
    const bills = toBudgetBills(evaluateBills([netflix], CYCLE, asBillTxs(rows as Parameters<typeof asBillTxs>[0]), CYCLE.today));
    const r = dailySpend(rows, { ...CYCLE, bills });
    expect(on(r, "2026-11-08")).toMatchObject({ spent: RM(4), leftOut: RM(55.9) });
    // Without the checklist, an unlinked entry is just spending.
    expect(on(dailySpend(rows, CYCLE), "2026-11-08")).toMatchObject({ spent: RM(59.9), level: "over" });
  });

  it("ignores a bill that is still unpaid", () => {
    const r = dailySpend([row("2026-11-02", 20)], { ...CYCLE, bills: [{ categoryId: 1, expected: RM(20), paidTxId: null }] });
    expect(on(r, "2026-11-02")).toMatchObject({ spent: RM(20), leftOut: 0 });
  });

  it("marks today, and leaves the days after it blank unless something is already recorded on them", () => {
    const r = dailySpend([row("2026-11-20", 8)], CYCLE);
    expect(r.days.filter((d) => d.isToday).map((d) => d.date)).toEqual(["2026-11-10"]);
    expect(on(r, "2026-11-10").future).toBe(false);
    expect(on(r, "2026-11-11").future).toBe(true);
    expect(on(r, "2026-11-20")).toMatchObject({ future: false, spent: RM(8) });
    expect(r.days.filter((d) => !d.future)).toHaveLength(17); // 26 Oct to 10 Nov is 16, plus the one entered ahead
  });

  it("has no today and nothing in the future for a finished period", () => {
    const r = dailySpend([], { ...CYCLE, today: "2027-01-15" });
    expect(r.days.some((d) => d.isToday || d.future)).toBe(false);
  });
});

describe("the calendar's shape", () => {
  it("lays out weeks Sunday first, padding the ends with empty slots", () => {
    const { weeks } = dailySpend([], CYCLE);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBeNull(); // Sun 25 Oct is before the cycle
    expect(weeks[0][1]?.date).toBe("2026-10-26"); // Monday, row 2
    expect(weeks[4][3]?.date).toBe("2026-11-25"); // Wednesday, row 4
    expect(weeks[4].slice(4)).toEqual([null, null, null]);
    for (const w of weeks) w.forEach((d, i) => d && expect(new Date(`${d.date}T00:00:00Z`).getUTCDay()).toBe(i));
  });

  it("needs six columns for a 31-day month that starts on a Saturday", () => {
    const { weeks } = dailySpend([], { start: "2026-08-01", end: "2026-08-31", today: "2026-08-31", limit: LIMIT });
    expect(weeks).toHaveLength(6);
  });

  it("names each month over the column where it begins", () => {
    expect(dailySpend([], CYCLE).months).toEqual([
      { week: 0, month: "2026-10" },
      { week: 1, month: "2026-11" },
    ]);
    expect(dailySpend([], { start: "2026-11-01", end: "2026-11-30", today: "2026-11-10", limit: LIMIT }).months).toEqual([{ week: 0, month: "2026-11" }]);
  });

  it("lets the later month name a column that two months begin in", () => {
    // Wed 30 Sep and Thu 1 Oct share the first column.
    expect(dailySpend([], { start: "2026-09-30", end: "2026-10-29", today: "2026-10-29", limit: LIMIT }).months).toEqual([{ week: 0, month: "2026-10" }]);
  });

  it("covers a cycle that runs long because payday is overdue, and one across the new year", () => {
    const long = dailySpend([], { start: "2026-12-26", end: "2027-02-08", today: "2027-02-08", limit: LIMIT });
    expect(long.days).toHaveLength(45);
    expect(long.months.map((m) => m.month)).toEqual(["2026-12", "2027-01", "2027-02"]);
  });
});

describe("the weeks leading up to the end of the period", () => {
  it("starts on the Sunday that gives CALENDAR_WEEKS columns, the last one holding the end", () => {
    // Wednesday 25 Nov 2026, a Saturday and a Sunday: whatever day the period ends on.
    for (const end of ["2026-11-25", "2026-10-31", "2026-11-01", "2026-12-31", "2027-01-02"]) {
      const start = calendarStart(end);
      const { weeks } = dailySpend([], { start, end, today: end, limit: LIMIT });
      expect(weeks, end).toHaveLength(CALENDAR_WEEKS);
      expect(new Date(`${start}T00:00:00Z`).getUTCDay(), end).toBe(0);
      expect(weeks[0][0]?.date, end).toBe(start); // the oldest column is whole
      expect(weeks.at(-1)!.some((d) => d?.date === end), end).toBe(true);
    }
    expect(calendarStart("2026-11-25")).toBe("2026-05-03");
  });

  it("applies the limit and the left-out categories to weeks before the period on screen", () => {
    const end = "2026-11-25";
    const rows = [row("2026-08-04", 80), row("2026-08-05", 80, { categoryId: 6 }), row("2026-04-30", 80)];
    const r = dailySpend(rows, { start: calendarStart(end), end, today: end, limit: LIMIT, leftOutCategoryIds: [6] });
    expect(over(r)).toEqual(["2026-08-04"]);
    expect(on(r, "2026-08-05")).toMatchObject({ spent: 0, leftOut: RM(80) });
    expect(r.days.some((d) => d.date === "2026-04-30")).toBe(false); // older than the oldest week
  });

  const netflix: BillDef = {
    id: 3, name: "Netflix", accountId: 1, categoryId: 1, nature: "want",
    amountMin: RM(55.9), amountMax: RM(55.9), dueDay: 8, matchKeywords: null, active: true,
  };
  const months = [{ start: "2026-10-01", end: "2026-10-31" }, { start: "2026-11-01", end: "2026-11-30" }];

  it("finds a never-linked bill payment in every period, not only the one on screen", () => {
    const rows = [row("2026-10-08", 55.9, { item: "Netflix" }), row("2026-11-08", 55.9, { item: "Netflix" })];
    const window = { start: calendarStart("2026-11-30"), end: "2026-11-30", today: "2026-11-30", limit: LIMIT };
    const everyPeriod = dailySpend(rows, { ...window, bills: billPaymentsByPeriod([netflix], months, rows, window.today) });
    expect(over(everyPeriod)).toEqual([]);
    expect([on(everyPeriod, "2026-10-08").leftOut, on(everyPeriod, "2026-11-08").leftOut]).toEqual([RM(55.9), RM(55.9)]);
    // Matching only the period on screen would count October's payment as everyday spending.
    const onScreenOnly = dailySpend(rows, { ...window, bills: billPaymentsByPeriod([netflix], months.slice(1), rows, window.today) });
    expect(over(onScreenOnly)).toEqual(["2026-10-08"]);
  });

  it("takes one unlinked look-alike per bill per period as its payment, as the Plan does", () => {
    const rows = [row("2026-10-08", 55.9, { item: "Netflix" }), row("2026-10-20", 55.9, { item: "Netflix" }), row("2026-11-08", 55.9, { item: "Netflix" })];
    const paid = billPaymentsByPeriod([netflix], months, rows, "2026-11-30").map((b) => b.paidTxId);
    expect(paid).toEqual([rows[0].id, rows[2].id]);
  });
});

describe("how many weeks show", () => {
  const css = readFileSync(join(__dirname, "..", "src", "app", "globals.css"), "utf8");

  it("reveals one more week for every further 24 px, from 7 up to all the weeks the calendar is given", () => {
    expect(css).toContain(".day-week:nth-last-child(-n + 7) {");
    const rules = [...css.matchAll(/@container day-calendar \(min-width: (\d+)px\) \{\s*\.day-week:nth-last-child\(-n \+ (\d+)\) \{ display: flex; \}/g)];
    // 26 px of day names, then at least 24 px for each week shown: so a square is never under a 24 px tap area.
    expect(rules.map((m) => [Number(m[1]), Number(m[2])])).toEqual(Array.from({ length: CALENDAR_WEEKS - 7 }, (_, i) => [26 + 24 * (8 + i), 8 + i]));
    expect(css).toContain(`min-width: ${26 + 24 * 7}px;`); // and never narrower than the 7 that always show
  });

  it("hands the leftmost week's month name on to each week it reveals", () => {
    for (let n = 8; n <= CALENDAR_WEEKS; n++) {
      const at = css.indexOf(`.day-week:nth-last-child(-n + ${n}) { display: flex; }`);
      const step = css.slice(at, css.indexOf("@container", at) < 0 ? undefined : css.indexOf("@container", at));
      expect(step, `${n} weeks`).toContain(`.day-week:nth-last-child(${n - 1}) .day-edge { visibility: hidden; }`);
      expect(step, `${n} weeks`).toContain(`.day-week:nth-last-child(${n}) .day-edge { visibility: visible; }`);
    }
  });
});

describe("the words", () => {
  const day = { date: "2026-11-04", spent: RM(35), leftOut: 0, level: 3 as const, future: false };

  it("says the date, the amount and where it stands against the limit, which the square's colour alone can't", () => {
    expect(daySquareText(day, LIMIT)).toBe(`Wed, 4 Nov: ${rm(35)} spent, within the limit`);
    expect(daySquareText({ ...day, spent: RM(62), level: "over" }, LIMIT)).toBe(`Wed, 4 Nov: ${rm(62)} spent, over the limit by ${rm(12)}`);
    expect(daySquareText({ ...day, spent: LIMIT, level: 4 }, LIMIT)).toBe(`Wed, 4 Nov: ${rm(50)} spent, exactly the limit`);
    expect(daySquareText({ ...day, spent: 0, level: 0 }, LIMIT)).toBe("Wed, 4 Nov: nothing counted");
    expect(daySquareText({ ...day, spent: 0, level: 0, future: true }, LIMIT)).toBe("Wed, 4 Nov: not here yet");
  });

  it("mentions what was left out, so the figure can be matched with the day's entries", () => {
    expect(daySquareText({ ...day, leftOut: RM(1200) }, LIMIT)).toBe(`Wed, 4 Nov: ${rm(35)} spent, within the limit, plus ${rm(1200)} in bills or categories left out`);
  });
});

/** The app's own formatting (Intl puts a no-break space after "RM"). */
function rm(n: number): string {
  return formatRM(RM(n));
}
