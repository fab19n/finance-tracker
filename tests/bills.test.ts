import { describe, expect, it } from "vitest";
import {
  descriptionMatchesBill,
  dueDateInCycle,
  evaluateBills,
  monthlyCommitments,
  normalizeName,
  summarizeBills,
  type BillDef,
  type BillTx,
} from "@/lib/plan/bills";

const RM = (n: number) => Math.round(n * 100);
const cycle = { start: "2026-09-28", end: "2026-10-27" };

let id = 0;
const bill = (name: string, min: number, max: number, dueDay: number | null, over: Partial<BillDef> = {}): BillDef => ({
  id: ++id,
  name,
  accountId: 1,
  categoryId: null,
  nature: "need",
  amountMin: RM(min),
  amountMax: RM(max),
  dueDay,
  matchKeywords: null,
  active: true,
  ...over,
});
let txId = 0;
const pay = (date: string, rm: number, o: Partial<BillTx> = {}): BillTx => ({
  id: ++txId,
  date,
  amount: RM(rm),
  type: "expense",
  accountId: 1,
  item: null,
  billId: null,
  ...o,
});

describe("dueDateInCycle", () => {
  it.each([
    [1, "2026-10-01"], // rent on the 1st falls in the second half of a 28th-to-27th cycle
    [15, "2026-10-15"],
    [28, "2026-09-28"], // due on payday itself
    [27, "2026-10-27"],
    [31, "2026-09-30"], // September has 30 days
  ])("due day %d -> %s", (dueDay, expected) => {
    expect(dueDateInCycle(dueDay, cycle)).toBe(expected);
  });
  it("falls back to the cycle's last day when a short cycle skips that day-of-month", () => {
    expect(dueDateInCycle(25, { start: "2026-02-10", end: "2026-02-20" })).toBe("2026-02-20");
  });
});

describe("evaluateBills", () => {
  const rent = bill("Rent", 950, 980, 1);
  const netflix = bill("Netflix", 88.9, 88.9, 8, { nature: "want" });
  const electricity = bill("Parents electricity", 65, 75, null);
  const spotify = bill("Spotify", 30.9, 30.9, 12, { nature: "want" });
  const today = "2026-10-09";

  it("marks paid (by link or by name), upcoming, due soon and unscheduled - most urgent first", () => {
    const txs = [pay("2026-10-08", 88.9, { billId: netflix.id }), pay("2026-10-01", 965, { item: "rent" })];
    const items = evaluateBills([rent, netflix, electricity, spotify], cycle, txs, today);
    expect(items.map((i) => [i.bill.name, i.status])).toEqual([
      ["Spotify", "due_soon"], // due on the 12th, 3 days away
      ["Parents electricity", "unscheduled"],
      ["Rent", "paid"],
      ["Netflix", "paid"],
    ]);
  });

  it("an unpaid bill past its due date is overdue", () => {
    const [i] = evaluateBills([bill("Study loan", 120, 120, 5)], cycle, [], today);
    expect(i.status).toBe("overdue");
    expect(i.daysUntilDue).toBe(-4);
  });

  it("reserves the HIGH end of the range while unpaid, nothing once paid", () => {
    const [unpaid] = evaluateBills([electricity], cycle, [], today);
    expect(unpaid.reserve).toBe(RM(75));
    expect(unpaid.expected).toBe(RM(70));
    const [paid] = evaluateBills([electricity], cycle, [pay("2026-10-05", 68, { billId: electricity.id })], today);
    expect(paid.reserve).toBe(0);
    expect(paid.paid).toMatchObject({ amount: RM(68), date: "2026-10-05" });
  });

  it("flags a payment well outside the usual range", () => {
    const high = evaluateBills([rent], cycle, [pay("2026-10-01", 1200, { billId: rent.id })], today)[0];
    expect(high.unusual).toBe(true);
    const fine = evaluateBills([rent], cycle, [pay("2026-10-01", 975, { billId: rent.id })], today)[0];
    expect(fine.unusual).toBe(false);
  });

  it("only counts expenses inside this cycle", () => {
    const outside = pay("2026-09-20", 965, { billId: rent.id }); // previous cycle
    const incomeLike = pay("2026-10-01", 965, { billId: rent.id, type: "income" });
    const transfer = pay("2026-10-01", 965, { billId: rent.id, type: "transfer" });
    const [i] = evaluateBills([rent], cycle, [outside, incomeLike, transfer], today);
    expect(i.paid).toBeNull(); // none of the three settles it...
    expect(i.status).toBe("overdue"); // ...so it is still unpaid, and it was due on the 1st
  });

  it("skips inactive bills", () => {
    expect(evaluateBills([{ ...rent, active: false }], cycle, [], today)).toEqual([]);
  });

  it("summarises what is paid and what is still to find", () => {
    const txs = [pay("2026-10-01", 960, { billId: rent.id })];
    const s = summarizeBills(evaluateBills([rent, electricity, spotify], cycle, txs, today));
    expect(s).toMatchObject({ count: 3, paidCount: 1, paidTotal: RM(960), remaining: RM(75) + RM(30.9) });
  });
});

describe("monthlyCommitments - a typical set of 12 bills (invented figures)", () => {
  const bills: BillDef[] = [
    bill("Insurance", 450, 450, null),
    bill("Rental", 900, 940, null),
    bill("Health levy", 50, 50, null),
    bill("AI assistant", 400, 400, null, { nature: "want" }),
    bill("Video streaming", 55.9, 55.9, null, { nature: "want" }),
    bill("Music streaming", 24.9, 24.9, null, { nature: "want" }),
    bill("Study loan", 120, 120, null),
    bill("Family internet", 99, 99, null),
    bill("Family electricity", 60, 80, null),
    bill("Cloud storage", 9.9, 9.9, null, { nature: "want" }),
    bill("Email storage", 39, 39, null, { nature: "want" }),
    bill("Chat assistant", 25, 25, null, { nature: "want" }),
  ];
  it("adds up to about RM 2,264 a month, RM 555 of it subscriptions", () => {
    const c = monthlyCommitments(bills);
    expect(c.count).toBe(12);
    expect(c.monthly).toBe(RM(2263.7)); // ranges count at their midpoint: rental 920, electricity 70
    expect(c.annual).toBe(RM(2263.7) * 12);
    expect(c.discretionaryMonthly).toBe(RM(554.7));
    expect(c.discretionaryAnnual).toBe(RM(554.7) * 12);
  });
  it("ignores inactive bills", () => {
    expect(monthlyCommitments([...bills, bill("Old gym", 100, 100, null, { active: false })]).count).toBe(12);
  });
});

describe("statement matching", () => {
  it("normalises names", () => {
    expect(normalizeName("  Netflix.com (SG) ")).toBe("netflix com sg");
  });
  it("matches on keywords or the bill's own name", () => {
    const b = { name: "Electricity - parents", matchKeywords: "tnb, tenaga nasional" };
    expect(descriptionMatchesBill(b, "BILL PAYMENT TNB 1234")).toBe(true);
    expect(descriptionMatchesBill(b, "TENAGA NASIONAL BHD")).toBe(true);
    expect(descriptionMatchesBill(b, "PETRONAS STATION")).toBe(false);
    expect(descriptionMatchesBill({ name: "Netflix", matchKeywords: null }, "NETFLIX.COM")).toBe(true);
  });
  it("REGRESSION: a bill's NAME only matches as a whole word, so Rent doesn't fire on PARENTS or CURRENT ACCOUNT", () => {
    const rent = { name: "Rent", matchKeywords: null };
    expect(descriptionMatchesBill(rent, "DUITNOW TRANSFER TO PARENTS")).toBe(false);
    expect(descriptionMatchesBill(rent, "CURRENT ACCOUNT FEE")).toBe(false);
    expect(descriptionMatchesBill(rent, "FPX PAYMENT RENT SEPTEMBER")).toBe(true);
    expect(descriptionMatchesBill(rent, "RENT")).toBe(true);
  });
  it("ignores keywords too short to be meaningful", () => {
    expect(descriptionMatchesBill({ name: "X", matchKeywords: "ab, tm" }, "MAB TM NET")).toBe(false);
  });
});
