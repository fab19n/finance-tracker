import { describe, expect, it } from "vitest";
import { billedMonths, descriptionMatchesShare, personLedger, pickShare, sharedBill, type ShareDef, type SharePayment } from "@/lib/plan/shares";

const RM = (n: number) => Math.round(n * 100);

// Netflix charged on the 3rd-ish of every month, January to October.
const NETFLIX_MONTHS = billedMonths(Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}-0${3 + (i % 3)}`));

let tx = 0;
const def = (id: number, name: string, over: Partial<ShareDef> = {}): ShareDef => ({
  id, billId: 1, name, share: RM(22.25), startMonth: "2026-01", endMonth: null, matchKeywords: null, active: true, ...over,
});
const pay = (shareId: number, date: string, rm: number): SharePayment => ({ shareId, txId: ++tx, date, amount: RM(rm) });

describe("billedMonths", () => {
  it("is the distinct months the bill was charged, oldest first, whatever order the dates arrive in", () => {
    expect(billedMonths(["2026-03-04", "2026-01-30", "2026-03-28", "2026-02-01"])).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(billedMonths([])).toEqual([]);
  });
});

describe("personLedger - lump sums land on the oldest months first", () => {
  it("RM 133.50 from someone who owes RM 22.25 a month is six months paid, four still owed", () => {
    const l = personLedger(def(1, "A"), NETFLIX_MONTHS, [pay(1, "2026-04-02", 133.5)]);
    expect(l.cells.map((c) => c.state)).toEqual(["paid", "paid", "paid", "paid", "paid", "paid", "unpaid", "unpaid", "unpaid", "unpaid"]);
    expect(l).toMatchObject({ owed: RM(222.5), paid: RM(133.5), balance: RM(89), paidThrough: "2026-06", status: "owes", monthsOwed: 4, monthsAhead: 0 });
  });

  it("several payments add up, and the latest one is remembered", () => {
    const l = personLedger(def(1, "A"), NETFLIX_MONTHS, [pay(1, "2026-02-10", 66.75), pay(1, "2026-08-09", 22.25), pay(1, "2026-05-01", 22.25)]);
    expect(l.paid).toBe(RM(111.25));
    expect(l.paidThrough).toBe("2026-05");
    expect(l.lastPayment).toEqual({ date: "2026-08-09", amount: RM(22.25) });
  });

  it("paying exactly what has been charged is settled", () => {
    const l = personLedger(def(1, "A"), NETFLIX_MONTHS, [pay(1, "2026-10-05", 222.5)]);
    expect(l).toMatchObject({ balance: 0, status: "settled", paidThrough: "2026-10", monthsOwed: 0, monthsAhead: 0 });
    expect(l.cells.every((c) => c.state === "paid")).toBe(true);
  });

  it("paying AHEAD runs 'paid through' on into months that have not been charged yet", () => {
    const l = personLedger(def(1, "A"), NETFLIX_MONTHS, [pay(1, "2026-10-05", 267)]); // 12 months
    expect(l).toMatchObject({ status: "ahead", monthsAhead: 2, paidThrough: "2026-12", monthsOwed: 0 });
    expect(l.balance).toBe(-RM(44.5));
  });

  it("paying ahead across a year end", () => {
    expect(personLedger(def(1, "A"), NETFLIX_MONTHS, [pay(1, "2026-10-05", 22.25 * 14)]).paidThrough).toBe("2027-02");
  });

  it("a part payment leaves the next month part-paid, and still counts as owed", () => {
    const l = personLedger(def(1, "A"), NETFLIX_MONTHS, [pay(1, "2026-03-01", 30)]);
    expect(l.cells[0]).toMatchObject({ state: "paid", paid: RM(22.25) });
    expect(l.cells[1]).toMatchObject({ state: "partial", paid: RM(7.75) });
    expect(l.cells[2].state).toBe("unpaid");
    expect(l.paidThrough).toBe("2026-01");
    expect(l.monthsOwed).toBe(9); // 222.50 - 30.00 = 192.50, which is 8.65 months: nine months not fully covered
  });

  it("someone who has paid nothing owes every month", () => {
    const l = personLedger(def(1, "A"), NETFLIX_MONTHS, []);
    expect(l).toMatchObject({ paid: 0, balance: RM(222.5), paidThrough: null, lastPayment: null, status: "owes", monthsOwed: 10 });
  });
});

describe("personLedger - who owes for which months", () => {
  it("only counts the months from when they joined", () => {
    const l = personLedger(def(1, "A", { startMonth: "2026-05" }), NETFLIX_MONTHS, []);
    expect(l.cells.map((c) => c.month)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(l.owed).toBe(RM(133.5));
  });

  it("stops counting once they have left", () => {
    const l = personLedger(def(1, "A", { endMonth: "2026-06" }), NETFLIX_MONTHS, [pay(1, "2026-03-01", 66.75)]);
    expect(l.cells).toHaveLength(6);
    expect(l).toMatchObject({ owed: RM(133.5), balance: RM(66.75), paidThrough: "2026-03" });
  });

  it("a month with no charge between two charges still counts: a late-posting charge must not make a month vanish", () => {
    const l = personLedger(def(1, "A"), ["2026-01", "2026-03"], []); // nothing dated February
    expect(l.cells.map((c) => c.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("months from BEFORE your records start still count, once you say when they joined (Netflix paid 'Oct25 to Mar26' in January)", () => {
    // Your data begins in January, but Kuganesh joined in October: his RM 133.50 on 2 Jan covers Oct-Mar, not Jan-Jun.
    const months = billedMonths(Array.from({ length: 9 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}-04`)); // Jan-Sep
    const l = personLedger(def(1, "Kug", { startMonth: "2025-10" }), months, [pay(1, "2026-01-02", 133.5), pay(1, "2026-07-07", 66.75), pay(1, "2026-09-08", 66.75)]);
    expect(l.cells).toHaveLength(12); // Oct 25 .. Sep 26
    expect(l).toMatchObject({ owed: RM(267), paid: RM(267), balance: 0, status: "settled", paidThrough: "2026-09" });
  });

  it("nothing is owed beyond the latest charge (this month isn't due until it is charged)", () => {
    expect(personLedger(def(1, "A"), ["2026-01", "2026-02"], []).cells).toHaveLength(2);
    expect(personLedger(def(1, "A", { startMonth: "2026-06" }), ["2026-01", "2026-02"], []).cells).toEqual([]); // joined after the last charge
  });

  it("ignores other people's payments", () => {
    const l = personLedger(def(1, "A"), NETFLIX_MONTHS, [pay(2, "2026-02-01", 222.5)]);
    expect(l.paid).toBe(0);
  });

  it("a payment before any month has been charged still counts as paid ahead", () => {
    const l = personLedger(def(1, "A", { startMonth: "2026-11" }), NETFLIX_MONTHS, [pay(1, "2026-10-20", 22.25)]);
    expect(l.cells).toEqual([]);
    expect(l).toMatchObject({ paidThrough: "2026-11", status: "ahead", monthsAhead: 1 });
  });

  it("a Spotify turn: RM 30.90 against a RM 5.15 share covers six months", () => {
    const months = billedMonths(["2026-03-08", "2026-04-08", "2026-05-08", "2026-06-08", "2026-07-08", "2026-08-08", "2026-09-08", "2026-10-08"]);
    const l = personLedger(def(7, "Friend", { share: RM(5.15), startMonth: "2026-03" }), months, [pay(7, "2026-03-09", 30.9)]);
    expect(l).toMatchObject({ paidThrough: "2026-08", monthsOwed: 2, balance: RM(10.3) });
  });

  it("a zero share never divides by zero", () => {
    expect(personLedger(def(1, "A", { share: 0 }), NETFLIX_MONTHS, [pay(1, "2026-02-01", 10)])).toMatchObject({ owed: 0, monthsOwed: 0, monthsAhead: 0 });
  });
});

describe("sharedBill - the whole picture for one bill", () => {
  const defs = [def(1, "A"), def(2, "B"), def(3, "C"), def(4, "D", { endMonth: "2026-03", active: false })];
  const payments = [pay(1, "2026-04-02", 133.5), pay(2, "2026-10-01", 267), pay(3, "2026-10-01", 0.01)];
  const s = sharedBill({ id: 1 }, RM(88.9), NETFLIX_MONTHS, defs, payments);

  it("adds up what is owed to you and what has been paid ahead, separately", () => {
    expect(s.owedToYou).toBe(RM(89) + RM(222.5 - 0.01) + RM(66.75)); // A owes 4 months, C nearly all ten, D (left in March) owes 3
    expect(s.paidAhead).toBe(RM(44.5)); // B paid 12 months of 10
  });

  it("works out what the bill really costs you each month: its price less the people still sharing", () => {
    expect(s.yourMonthlyCost).toBe(RM(88.9) - 3 * RM(22.25)); // D has left, so only A, B and C count
  });

  it("never reports a negative cost if the shares add up to more than the bill", () => {
    expect(sharedBill({ id: 1 }, RM(40), NETFLIX_MONTHS, defs, payments).yourMonthlyCost).toBe(0);
  });
});

describe("recognising a person's payment on a bank line", () => {
  it("matches the words you gave anywhere in the line, ignoring case and punctuation", () => {
    const s = def(1, "Kug", { matchKeywords: "kugan, k.kanda" });
    expect(descriptionMatchesShare(s, "DUITNOW TO ACCOUNT 612772696 KUGANESH A/L KANDASAMY Rms Oct25")).toBe(true);
    expect(descriptionMatchesShare(s, "DUITNOW TO ACCOUNT SOMEONE ELSE")).toBe(false);
  });

  it("with no words given, matches the name as whole words only", () => {
    const s = def(1, "Ali", { matchKeywords: null });
    expect(descriptionMatchesShare(s, "DUITNOW TO ACCOUNT 123 ALI BIN ABU")).toBe(true);
    expect(descriptionMatchesShare(s, "DUITNOW TO ACCOUNT 123 KALIDAS A/L RAJU")).toBe(false);
  });

  it("an empty or too-short name matches nothing, rather than everything", () => {
    expect(descriptionMatchesShare(def(1, "", { matchKeywords: null }), "ANYTHING")).toBe(false);
    expect(descriptionMatchesShare(def(1, "Al", { matchKeywords: null }), "AL FARABI")).toBe(false);
  });

  describe("pickShare", () => {
    const netflix = def(1, "Kuganesh", { share: RM(22.25), matchKeywords: "kuganesh" });
    const spotify = def(2, "Kuganesh", { billId: 2, share: RM(5.15), matchKeywords: "kuganesh" });
    const other = def(3, "Mohammad", { matchKeywords: "syafil" });

    it("picks the one person named on the line", () => {
      expect(pickShare([netflix, other], "KUGANESH A/L K", RM(66.75))).toBe(netflix);
      expect(pickShare([netflix, other], "NOBODY KNOWN", RM(66.75))).toBeNull();
    });

    it("one friend in two plans: the amount decides, when exactly one share divides it", () => {
      expect(pickShare([netflix, spotify], "KUGANESH", RM(133.5))).toBe(netflix); // 6 x 22.25 (and 25.9 x 5.15 is not whole)
      expect(pickShare([netflix, spotify], "KUGANESH", RM(30.9))).toBe(spotify); // 6 x 5.15
    });

    it("...and says nothing when it cannot tell, rather than guessing", () => {
      expect(pickShare([netflix, spotify], "KUGANESH", RM(7))).toBeNull(); // divides neither
      const same = def(4, "Kuganesh", { billId: 3, share: RM(22.25), matchKeywords: "kuganesh" });
      expect(pickShare([netflix, same], "KUGANESH", RM(22.25))).toBeNull(); // divides both
    });

    it("ignores people who have left", () => {
      expect(pickShare([{ ...netflix, active: false }], "KUGANESH", RM(22.25))).toBeNull();
    });
  });
});
