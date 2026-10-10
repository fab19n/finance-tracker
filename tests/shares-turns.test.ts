import { describe, expect, it } from "vitest";
import { rotationBill, rotationLedger, rotationWindow, TURN_TOLERANCE, type ShareDef, type SharePayment, type TurnSlot } from "@/lib/plan/shares";

const RM = (n: number) => Math.round(n * 100);
const BILL = RM(30.9);

let tx = 0;
const person = (id: number, name: string): ShareDef => ({ id, billId: 1, name, share: BILL, startMonth: "2026-01", endMonth: null, matchKeywords: null, active: true });
const pay = (shareId: number, date: string, rm: number): SharePayment => ({ shareId, txId: ++tx, date, amount: RM(rm) });

// Invented people (ids 1-5) in a six-month rotation: you take the first month of each cycle (March, September), the five
// others take the rest. Cycle one (Mar-Aug 2026) is complete; the second has just started.
const [ANA, BEN, CHO, DEV, EVE] = [person(1, "Ana"), person(2, "Ben"), person(3, "Cho"), person(4, "Dev"), person(5, "Eve")];
const DEFS = [ANA, BEN, CHO, DEV, EVE];
const CYCLE_ONE: TurnSlot[] = [
  { month: "2026-03", who: "you" }, { month: "2026-04", who: 2 }, { month: "2026-05", who: 1 }, { month: "2026-06", who: 3 }, { month: "2026-07", who: 4 }, { month: "2026-08", who: 5 },
  { month: "2026-09", who: "you" },
];
const ledger = (schedule: TurnSlot[], payments: SharePayment[], today = "2026-10-09") =>
  rotationLedger({ schedule, defs: DEFS, payments, dueFor: () => BILL, today });
const who = (l: ReturnType<typeof ledger>, id: number) => l.people.find((p) => p.share.id === id)!;

describe("rotationLedger: a payment settles the payer's OWN turn, not six months", () => {
  it("REGRESSION: one RM 30.90 for your turn is one month paid, not six; and nobody is 'paid ahead' on a plan they have settled", () => {
    // The monthly model read each RM 30.90 as six months of RM 5.15, so a person who had settled two turns looked two
    // months ahead and one who had settled one turn looked four months behind.
    const l = ledger(CYCLE_ONE, [pay(1, "2026-05-06", 30.9), pay(2, "2026-05-03", 30.9), pay(3, "2026-08-02", 30.9), pay(4, "2026-07-07", 30.9), pay(5, "2026-08-20", 30.9)]);
    expect(l.owedToYou).toBe(0);
    expect(l.dueNow).toEqual([]);
    expect(l.unmatched).toBe(0);
    for (const p of l.people) expect(p.turns.map((c) => c.state)).toEqual(["paid"]);
    expect(who(l, 1).turns[0]).toMatchObject({ month: "2026-05", paid: BILL, paidOn: ["2026-05-06"] });
  });

  it("a turn that has come round and has no payment is owed; one still to come is only upcoming", () => {
    const schedule: TurnSlot[] = [...CYCLE_ONE, { month: "2026-10", who: 1 }, { month: "2026-11", who: 2 }];
    // everyone has settled the first cycle; nobody has paid for the second
    const l = ledger(schedule, [pay(1, "2026-05-06", 30.9), pay(2, "2026-05-03", 30.9), pay(3, "2026-08-02", 30.9), pay(4, "2026-07-07", 30.9), pay(5, "2026-08-20", 30.9)]);
    expect(who(l, 1).turns.map((c) => [c.month, c.state])).toEqual([["2026-05", "paid"], ["2026-10", "due"]]);
    expect(who(l, 2).turns.map((c) => [c.month, c.state])).toEqual([["2026-04", "paid"], ["2026-11", "upcoming"]]);
    expect(l.dueNow).toEqual([{ month: "2026-10", shareId: 1, amount: BILL }]);
    expect(l.owedToYou).toBe(BILL);
    expect(who(l, 1)).toMatchObject({ owes: BILL, next: expect.objectContaining({ month: "2026-10" }) });
    expect(who(l, 2)).toMatchObject({ owes: 0, next: expect.objectContaining({ month: "2026-11" }) });
  });

  it("this month's turn is due from the 1st; next month's is not", () => {
    const schedule: TurnSlot[] = [{ month: "2026-10", who: 1 }, { month: "2026-11", who: 2 }];
    const l = ledger(schedule, [], "2026-10-01");
    expect(who(l, 1).turns[0].state).toBe("due");
    expect(who(l, 2).turns[0].state).toBe("upcoming");
  });

  it("the oldest turn takes the money first; paying early settles a turn that has not come round", () => {
    const schedule: TurnSlot[] = [{ month: "2026-04", who: 1 }, { month: "2026-10", who: 1 }, { month: "2027-04", who: 1 }];
    const l = ledger(schedule, [pay(1, "2026-04-05", 30.9), pay(1, "2026-09-20", 30.9)], "2026-10-09");
    expect(who(l, 1).turns.map((c) => [c.month, c.state, c.paidOn])).toEqual([
      ["2026-04", "paid", ["2026-04-05"]],
      ["2026-10", "paid", ["2026-09-20"]], // paid before its month: settled, not "owed"
      ["2027-04", "upcoming", []],
    ]);
    expect(l.owedToYou).toBe(0);
  });

  it("one transfer covering two turns settles both, oldest first", () => {
    const schedule: TurnSlot[] = [{ month: "2026-02", who: 2 }, { month: "2026-04", who: 2 }];
    const l = ledger(schedule, [pay(2, "2026-05-03", 61.8)]);
    expect(who(l, 2).turns.map((c) => [c.month, c.state, c.paidOn])).toEqual([["2026-02", "paid", ["2026-05-03"]], ["2026-04", "paid", ["2026-05-03"]]]);
    expect(who(l, 2).unmatched).toBe(0);
  });

  it("a payment that is a little short still counts, and says by how much", () => {
    // RM 61.00 for two RM 30.90 turns: RM 0.80 short, inside the RM 1.00 that friends round by
    const schedule: TurnSlot[] = [{ month: "2026-02", who: 2 }, { month: "2026-04", who: 2 }];
    const l = ledger(schedule, [pay(2, "2026-05-03", 61)]);
    expect(who(l, 2).turns.map((c) => [c.state, c.short])).toEqual([["paid", 0], ["paid", RM(0.8)]]);
    expect(l.owedToYou).toBe(0);
    expect(TURN_TOLERANCE).toBe(100);
  });

  it("a payment short by more than that is part paid, and the rest is owed once the turn has come", () => {
    const l = ledger([{ month: "2026-04", who: 3 }], [pay(3, "2026-04-10", 20)]);
    expect(who(l, 3).turns[0]).toMatchObject({ state: "part", paid: RM(20), short: 0 });
    expect(who(l, 3).owes).toBe(BILL - RM(20));
    expect(l.dueNow).toEqual([{ month: "2026-04", shareId: 3, amount: BILL - RM(20) }]);
  });

  it("money for a month that isn't on the plan is kept apart (not credited to a different month)", () => {
    // Ana's December payment: December isn't planned, and her only planned turn (May) is not covered by it... but it IS
    // her oldest unsettled turn, so it settles that. The leftover beyond every turn is what stays unmatched.
    const l = ledger([{ month: "2026-05", who: 1 }], [pay(1, "2026-01-02", 30.9), pay(1, "2026-05-06", 30.9)]);
    expect(who(l, 1).turns[0]).toMatchObject({ state: "paid", paidOn: ["2026-01-02"] });
    expect(who(l, 1).unmatched).toBe(BILL);
    expect(l.unmatched).toBe(BILL);
  });

  it("a month costs what the bill was charged that month", () => {
    const l = rotationLedger({ schedule: [{ month: "2026-04", who: 1 }, { month: "2026-05", who: 2 }], defs: DEFS, payments: [pay(1, "2026-04-09", 30.9)], dueFor: (m) => (m === "2026-04" ? RM(35) : BILL), today: "2026-10-09" });
    expect(who(l, 1).turns[0]).toMatchObject({ due: RM(35), state: "part", paid: BILL }); // RM 4.10 short of a price rise
    expect(l.dueNow.map((d) => [d.month, d.shareId, d.amount])).toEqual([["2026-04", 1, RM(4.1)], ["2026-05", 2, BILL]]);
  });

  it("a person with no turn planned owes nothing, however much they sent", () => {
    const l = ledger([{ month: "2026-04", who: 2 }], [pay(4, "2026-07-07", 30.9)]);
    expect(who(l, 4)).toMatchObject({ owes: 0, next: null, unmatched: BILL, turns: [] });
  });
});

describe("rotationLedger: money for a month nobody has been given yet", () => {
  it("lists each payment no planned month took, so the card can ask which month they covered", () => {
    // Ana covered May (planned). On 12 Oct she sent another RM 30.90: she has said she will cover a month, but it isn't on the plan yet.
    const l = ledger([{ month: "2026-05", who: 1 }], [pay(1, "2026-05-06", 30.9), pay(1, "2026-10-12", 30.9)]);
    expect(who(l, 1).leftovers).toEqual([{ txId: expect.any(Number), date: "2026-10-12", amount: BILL }]);
    expect(who(l, 1).unmatched).toBe(BILL);
  });

  it("a transfer that covers more than the planned months leaves only the rest, as one payment", () => {
    const l = ledger([{ month: "2026-05", who: 1 }], [pay(1, "2026-10-12", 61.8)]);
    expect(who(l, 1).turns[0]).toMatchObject({ state: "paid", paidOn: ["2026-10-12"] });
    expect(who(l, 1).leftovers).toEqual([{ txId: expect.any(Number), date: "2026-10-12", amount: BILL }]);
  });

  it("under a ringgit left over is rounding, not another month somebody covered", () => {
    const l = ledger([{ month: "2026-05", who: 1 }], [pay(1, "2026-05-06", 31.4)]); // RM 0.50 over
    expect(who(l, 1)).toMatchObject({ unmatched: 0, leftovers: [] });
    expect(l.unmatched).toBe(0);
  });

  it("remembers which months the bill was charged, oldest first (a month of yours that was charged is paid)", () => {
    const l = rotationLedger({ schedule: CYCLE_ONE, defs: DEFS, payments: [], dueFor: () => BILL, today: "2026-10-09", charged: ["2026-09", "2026-03", "2026-04"] });
    expect(l.charged).toEqual(["2026-03", "2026-04", "2026-09"]);
    expect(rotationLedger({ schedule: [], defs: DEFS, payments: [], dueFor: () => BILL, today: "2026-10-09" }).charged).toEqual([]);
  });
});

describe("rotationBill and rotationWindow", () => {
  it("shapes the ledger like any shared bill: what is owed is the turns that have come round", () => {
    const r = ledger([...CYCLE_ONE, { month: "2026-10", who: 1 }], []);
    const b = rotationBill({ id: 1 }, BILL, r);
    expect(b).toMatchObject({ months: [], people: [], paidAhead: 0, owedToYou: r.owedToYou, rotation: r });
    // your months are 2 of the 8 on the plan, so on average you pay a quarter of the bill
    expect(b.yourMonthlyCost).toBe(Math.round((BILL * 2) / 8));
  });

  it("shows your two latest cycles: from the cycle before the current one to the end of the current one", () => {
    expect(rotationWindow(CYCLE_ONE, "2026-10")).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("falls back to six months either side of today when none of your months are planned", () => {
    expect(rotationWindow([{ month: "2026-04", who: 2 }], "2026-10")).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);
  });

  it("with only one of your months so far, shows the six before it as well", () => {
    expect(rotationWindow([{ month: "2026-09", who: "you" }], "2026-10")).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});
