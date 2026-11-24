import { describe, expect, it } from "vitest";
import { billCaption, billStatusTag, billTiles } from "@/lib/plan/bills-view";
import { evaluateBills, type BillDef, type BillTx } from "@/lib/plan/bills";
import { paydayStatement, savingsSummary } from "@/lib/plan/statement";

const RM = (n: number) => Math.round(n * 100);
const sp = (s: string) => s.replace(/[  ]/g, " ");
const bill = (id: number, name: string, min: number, max: number, dueDay: number | null, active = true): BillDef => ({
  id,
  name,
  accountId: 1,
  categoryId: 1,
  nature: "need",
  amountMin: RM(min),
  amountMax: RM(max),
  dueDay,
  matchKeywords: null,
  active,
});
const cycle = { start: "2026-11-01", end: "2026-11-30" };
const pay = (id: number, billId: number, date: string, amount: number): BillTx => ({ id, date, amount: RM(amount), type: "expense", accountId: 1, item: "x", billId });

describe("billTiles", () => {
  const bills = [bill(1, "Rent", 1100, 1100, 1), bill(2, "Unifi", 129, 129, 12), bill(3, "Electricity", 150, 210, 20), bill(4, "Paused", 50, 50, 5, false)];
  const items = evaluateBills(bills, cycle, [pay(1, 1, "2026-11-01", 1100)], "2026-11-05");

  it("adds paid and still-to-find into the month, ignoring paused bills", () => {
    const t = billTiles(items, "2026-11-05");
    expect(t.paid).toBe(RM(1100));
    expect(t.remaining).toBe(RM(129 + 210));
    expect(t.month).toBe(t.paid + t.remaining);
    expect(t.count).toBe(3);
    expect(t.paidCount).toBe(1);
  });

  it("names the soonest unpaid bill still ahead", () => {
    expect(billTiles(items, "2026-11-05").next).toEqual({ name: "Unifi", date: "2026-11-12", overdue: false });
  });

  it("falls back to the longest-overdue bill when nothing is ahead", () => {
    const late = evaluateBills([bill(2, "Unifi", 129, 129, 12), bill(3, "Water", 20, 20, 8)], cycle, [], "2026-11-25");
    expect(billTiles(late, "2026-11-25").next).toEqual({ name: "Water", date: "2026-11-08", overdue: true });
  });

  it("has no next bill when everything is paid or undated", () => {
    expect(billTiles([], "2026-11-05").next).toBeNull();
    const done = evaluateBills([bill(1, "Rent", 10, 10, 1)], cycle, [pay(1, 1, "2026-11-01", 10)], "2026-11-05");
    expect(billTiles(done, "2026-11-05")).toMatchObject({ next: null, remaining: 0, month: RM(10) });
  });
});

describe("billStatusTag and billCaption", () => {
  const items = evaluateBills([bill(1, "Rent", 1100, 1100, 1), bill(2, "Unifi", 129, 129, 12), bill(3, "Water", 20, 20, 4), bill(4, "Ins", 5, 5, 28)], cycle, [pay(1, 1, "2026-11-01", 1100)], "2026-11-10");
  const by = (n: string) => items.find((i) => i.bill.name === n)!;

  it("always says it in words", () => {
    expect(billStatusTag(by("Rent"))).toEqual({ tone: "good", text: "Paid 1 Nov" });
    expect(billStatusTag(by("Water"))).toEqual({ tone: "danger", text: "Overdue · 6 days" });
    expect(billStatusTag(by("Unifi"))).toEqual({ tone: "warn", text: "Due in 2 days" });
    expect(billStatusTag(by("Ins"))).toBeNull();
  });

  it("builds the caption from account, due date, range and people", () => {
    expect(sp(billCaption(bill(1, "a", 1100, 1100, 1), { account: "Maybank", dueDate: "2026-11-01" }))).toBe("Maybank · due 1 Nov");
    expect(sp(billCaption(bill(3, "a", 150, 210, 20), { dueDate: null }))).toBe("due day 20 · Range RM 150.00 to RM 210.00");
    expect(sp(billCaption(bill(5, "a", 54.9, 54.9, null), { people: 3 }))).toBe("no due day · Shared with 3");
  });
});

describe("paydayStatement and savingsSummary", () => {
  it("keeps allowance and buffer together and sends the rest to savings", () => {
    expect(paydayStatement({ income: RM(5400), bills: RM(2480), allowance: RM(1500), buffer: RM(200) })).toEqual({
      salary: RM(5400),
      bills: RM(2480),
      kept: RM(1700),
      toSavings: RM(1220),
      deficit: 0,
    });
  });

  it("reports a plan that does not fit", () => {
    const s = paydayStatement({ income: RM(2000), bills: RM(1800), allowance: RM(500), buffer: RM(100) });
    expect(s.toSavings).toBe(0);
    expect(s.deficit).toBe(RM(400));
  });

  const flow = (deposited: number, drawn: number, spentFromSavings: number, trueSaved: number, complete = false) => ({ deposited: RM(deposited), drawn: RM(drawn), spentFromSavings: RM(spentFromSavings), trueSaved: RM(trueSaved), complete });

  it("says nothing came back when it did not", () => {
    const s = savingsSummary(flow(800, 0, 0, 800), RM(800));
    expect(sp(s.text)).toBe("You planned RM 800.00 and moved RM 800.00. Nothing was drawn back out this cycle.");
    expect(s.fraction).toBe(1);
  });

  it("says what came back and what was really saved", () => {
    const s = savingsSummary(flow(800, 300, 100, 350), RM(1000));
    expect(sp(s.text)).toBe("You planned RM 1,000.00 and moved RM 800.00. RM 400.00 came back out, so you really saved RM 350.00.");
    expect(s.fraction).toBeCloseTo(0.8);
    expect(s.out).toBe(RM(400));
  });

  it("handles no move yet, and no plan", () => {
    expect(sp(savingsSummary(flow(0, 0, 0, 0), RM(800)).text)).toBe("You planned RM 800.00 and have not moved anything yet.");
    expect(sp(savingsSummary(flow(0, 0, 0, 0, true), RM(800)).text)).toBe("You planned RM 800.00 and moved nothing.");
    const none = savingsSummary(flow(500, 0, 0, 500, true), null);
    expect(sp(none.text)).toBe("You moved RM 500.00 to savings that cycle. Nothing was drawn back out that cycle.");
    expect(none.fraction).toBeNull();
  });
});
