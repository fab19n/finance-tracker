import { describe, expect, it } from "vitest";
import { billedMonths, descriptionMatchesShare, earlierShareAmounts, personLedger, pickShare, sharedBill, type PriceHistory, type ShareDef, type SharePayment } from "@/lib/plan/shares";
import { formatRM } from "@/lib/money";
import { expectedText, monthNames, owedMonthsText, standingText } from "@/lib/plan/shares-text";

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

// ---- a price change: the months before it keep the old price -----------------------------------------------------------
// A RM 80 bill split in four (RM 20 each) that rises to RM 88 (RM 22 each) from November 2026.
describe("a price rise counts only from the month it took effect", () => {
  const monthsTo = (last: number) => Array.from({ length: last }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
  const RISE_MONTHS = monthsTo(11); // charged January to November
  const rise = (): PriceHistory => ({
    charges: new Map(RISE_MONTHS.map((m) => [m, RM(m === "2026-11" ? 88 : 80)])),
    typical: RM(88),
  });
  const quarter = def(1, "A", { share: RM(22) }); // today's share
  const ledger = (payments: SharePayment[], over: Partial<ShareDef> = {}) => personLedger({ ...quarter, ...over }, RISE_MONTHS, payments, rise());

  it("prices every charged month at what it was charged: RM 20 until October, RM 22 in November", () => {
    const l = ledger([]);
    expect(l.cells.map((c) => c.cost)).toEqual([...Array(10).fill(RM(20)), RM(22)]);
    expect(l).toMatchObject({ owed: RM(222), paid: 0, owedNow: RM(222), expectedNext: 0, status: "owes", monthsOwed: 11 });
  });

  it("REGRESSION: twelve months paid at the old price leave November AND December part paid (a RM 2 balance each)", () => {
    // 120 + 60 + 60 = twelve shares of RM 20, the last three paid in September for October to December.
    const l = ledger([pay(1, "2026-01-02", 120), pay(1, "2026-07-07", 60), pay(1, "2026-09-08", 60)]);
    expect(l.cells.slice(0, 10).every((c) => c.state === "paid")).toBe(true);
    expect(l.cells[10]).toMatchObject({ month: "2026-11", state: "partial", cost: RM(22), paid: RM(20), remaining: RM(2), upcoming: false });
    expect(l.upcoming).toHaveLength(1);
    expect(l.upcoming[0]).toMatchObject({ month: "2026-12", state: "partial", cost: RM(22), paid: RM(20), remaining: RM(2), upcoming: true });
    expect(l).toMatchObject({ owedNow: RM(2), expectedNext: RM(2), aheadPaid: RM(20), status: "owes", paidThrough: "2026-10", monthsOwed: 1, monthsAhead: 0 });
    expect(l.balance).toBe(RM(222) - RM(240)); // ahead overall, and still owing for November: the net position hides it
  });

  it("left-over change finishes the months that are short, oldest first, and spills into the next", () => {
    // Twelve shares at RM 20 plus RM 5 of change (60 + 60 + 65): November and December are made up, RM 1 reaches January.
    const l = ledger([pay(1, "2026-01-02", 120), pay(1, "2026-08-03", 60), pay(1, "2026-09-08", 65)]);
    expect(l.cells[10]).toMatchObject({ state: "paid", paid: RM(22), remaining: 0 });
    expect(l.upcoming.map((c) => [c.month, c.state, c.paid, c.remaining])).toEqual([
      ["2026-12", "paid", RM(22), 0],
      ["2027-01", "partial", RM(1), RM(21)],
    ]);
    expect(l).toMatchObject({ owedNow: 0, expectedNext: RM(21), status: "ahead", paidThrough: "2026-12", monthsAhead: 1 });
  });

  it("a payment at the NEW price into an old month passes the surplus on instead of losing it", () => {
    const l = ledger([pay(1, "2026-11-05", 22)]); // a RM 22 share, but January costs RM 20
    expect(l.cells[0]).toMatchObject({ state: "paid", paid: RM(20) });
    expect(l.cells[1]).toMatchObject({ state: "partial", paid: RM(2), remaining: RM(18) });
    expect(l.owedNow).toBe(RM(222) - RM(22));
  });

  it("paid far ahead at the old price: every month from November on is part paid, and they are listed after the charged ones", () => {
    const l = ledger([pay(1, "2026-10-05", 280)]); // fourteen shares of RM 20
    expect(l.cells[10].state).toBe("partial");
    expect(l.upcoming.map((c) => [c.month, c.state, c.remaining])).toEqual([
      ["2026-12", "partial", RM(2)],
      ["2027-01", "partial", RM(2)],
      ["2027-02", "partial", RM(2)],
    ]);
    expect(l).toMatchObject({ owedNow: RM(2), expectedNext: RM(6) });
  });

  it("a lump that is not a whole number of months leaves a part month", () => {
    const l = personLedger(def(1, "A", { share: RM(22) }), RISE_MONTHS.slice(0, 3), [pay(1, "2026-03-01", 50)], rise()); // 2 shares of RM 20 + RM 10
    expect(l.cells.map((c) => [c.state, c.paid])).toEqual([["paid", RM(20)], ["paid", RM(20)], ["partial", RM(10)]]);
  });

  it("someone who joined after the rise only ever pays the new price", () => {
    const l = ledger([], { startMonth: "2026-11" });
    expect(l.cells.map((c) => [c.month, c.cost])).toEqual([["2026-11", RM(22)]]);
  });

  it("a month with no charge uses the nearest earlier charged month; one before the records, the first known", () => {
    const price: PriceHistory = { charges: new Map([["2026-02", RM(80)], ["2026-04", RM(88)]]), typical: RM(88) };
    const l = personLedger(def(1, "A", { share: RM(22) }), ["2026-02", "2026-04"], [], price);
    expect(l.cells.map((c) => [c.month, c.cost])).toEqual([["2026-01", RM(20)], ["2026-02", RM(20)], ["2026-03", RM(20)], ["2026-04", RM(22)]]);
  });

  it("two charges in one month add up (a late-posting charge landing next to the new one counts twice)", () => {
    const price: PriceHistory = { charges: new Map([["2026-01", RM(80)], ["2026-02", RM(160)]]), typical: RM(88) };
    expect(personLedger(def(1, "A", { share: RM(22) }), ["2026-01", "2026-02"], [], price).cells.map((c) => c.cost)).toEqual([RM(20), RM(40)]);
  });

  it("months not charged yet cost the bill's usual amount, so raising it before the charge arrives is seen at once", () => {
    const price: PriceHistory = { charges: new Map([["2026-01", RM(80)]]), typical: RM(96) }; // RM 24 each from now on
    const l = personLedger(def(1, "A", { share: RM(24) }), ["2026-01"], [pay(1, "2026-01-02", 40)], price);
    expect(l.upcoming[0]).toMatchObject({ month: "2026-02", cost: RM(24), paid: RM(20), remaining: RM(4) });
  });

  it("the listed months always add up to the totals, and no money is lost on the way", () => {
    const scenarios: SharePayment[][] = [
      [],
      [pay(1, "2026-01-02", 120), pay(1, "2026-07-07", 60), pay(1, "2026-09-08", 60)],
      [pay(1, "2026-01-02", 120), pay(1, "2026-08-03", 60), pay(1, "2026-09-08", 65)],
      [pay(1, "2026-11-05", 22), pay(1, "2026-03-01", 7.5)],
      [pay(1, "2026-10-05", 280)],
      [pay(1, "2026-02-01", 0.01), pay(1, "2026-12-01", 1000)],
    ];
    for (const payments of scenarios) {
      const l = ledger(payments);
      const all = [...l.cells, ...l.upcoming];
      expect(l.cells.reduce((s, c) => s + c.remaining, 0)).toBe(l.owedNow);
      expect(l.upcoming.reduce((s, c) => s + c.remaining, 0)).toBe(l.expectedNext);
      expect(l.upcoming.reduce((s, c) => s + c.paid, 0)).toBe(l.aheadPaid);
      expect(all.reduce((s, c) => s + c.paid, 0)).toBe(l.paid); // every sen received sits on some month
      expect(l.owed).toBe(l.cells.reduce((s, c) => s + c.cost, 0));
    }
  });

  it("with no price change the result is IDENTICAL to a ledger without price history", () => {
    const flat: PriceHistory = { charges: new Map(RISE_MONTHS.map((m) => [m, RM(88)])), typical: RM(88) };
    const sets = [
      [],
      [pay(1, "2026-04-02", 133.5)],
      [pay(1, "2026-02-10", 66), pay(1, "2026-08-09", 22), pay(1, "2026-05-01", 22)],
      [pay(1, "2026-10-05", 22 * 14)],
      [pay(1, "2026-03-01", 30), pay(1, "2026-04-01", 30), pay(1, "2026-05-01", 30)],
    ];
    for (const payments of sets) expect(personLedger(quarter, RISE_MONTHS, payments, flat)).toEqual(personLedger(quarter, RISE_MONTHS, payments));
  });

  it("sharedBill adds up what is owed now, what is paid in advance, and what is expected once the next month is charged", () => {
    const defs = [def(1, "A", { share: RM(22) }), def(2, "B", { share: RM(22) })];
    const payments = [pay(1, "2026-01-02", 120), pay(1, "2026-07-07", 60), pay(1, "2026-09-08", 60), pay(2, "2026-02-01", 100)];
    const s = sharedBill({ id: 1 }, RM(88), RISE_MONTHS, defs, payments, rise().charges);
    const [a, b] = s.people;
    expect(s.owedToYou).toBe(a.owedNow + b.owedNow);
    expect(a.owedNow).toBe(RM(2)); // November, paid at the old price
    expect(b.owedNow).toBe(RM(222) - RM(100)); // five shares of RM 20 and nothing more
    expect(s.paidAhead).toBe(RM(20));
    expect(s.expectedNext).toBe(RM(2));
    expect(s.upcomingMonths).toEqual(["2026-12"]);
    expect(s.yourMonthlyCost).toBe(RM(88) - 2 * RM(22));
  });
});

describe("recognising a lump of months paid at the old price", () => {
  it("earlierShareAmounts: what a month used to cost them, other than today's share", () => {
    const price: PriceHistory = { charges: new Map([["2026-01", RM(80)], ["2026-02", RM(80)], ["2026-11", RM(88)]]), typical: RM(88) };
    expect(earlierShareAmounts(RM(22), price)).toEqual([RM(20)]);
    expect(earlierShareAmounts(RM(22), { ...price, typical: 0 })).toEqual([]);
    expect(earlierShareAmounts(0, price)).toEqual([]);
  });

  it("one friend in two plans: a lump of old-price months still says which plan it is", () => {
    const netflix = def(1, "Kuganesh", { share: RM(22), matchKeywords: "kuganesh" });
    const spotify = def(2, "Kuganesh", { billId: 2, share: RM(5.15), matchKeywords: "kuganesh" });
    expect(pickShare([netflix, spotify], "KUGANESH", RM(120))).toBeNull(); // 120 is not a whole number of RM 22 or RM 5.15
    expect(pickShare([{ ...netflix, earlierShares: [RM(20)] }, spotify], "KUGANESH", RM(120))).toMatchObject({ id: 1 }); // six months at RM 20
  });
});

describe("the words for a person's standing", () => {
  const charges = new Map<string, number>(Array.from({ length: 11 }, (_, i) => [`2026-${String(i + 1).padStart(2, "0")}`, RM(i === 10 ? 88 : 80)]));
  const rise: PriceHistory = { charges, typical: RM(88) };
  const months = [...charges.keys()];
  const ledger = (payments: SharePayment[], over: Partial<ShareDef> = {}) => personLedger(def(1, "A", { share: RM(22), ...over }), months, payments, rise);

  it("owing for a part-paid charged month and expecting more for the next one", () => {
    const l = ledger([pay(1, "2026-01-02", 120), pay(1, "2026-07-07", 60), pay(1, "2026-09-08", 60)]);
    expect(standingText(l)).toEqual({ text: `Owes ${formatRM(RM(2))} now · Nov (part) · ${formatRM(RM(2))} more when Dec is charged`, tone: "owes" });
  });

  it("behind with nothing ahead: the total and every month it is made of", () => {
    const l = ledger([pay(1, "2026-01-02", 160), pay(1, "2026-08-03", 0.5)]); // eight shares and 50 sen: September onwards owed
    expect(owedMonthsText(l)).toBe("Sep (part), Oct, Nov");
    expect(standingText(l).text).toBe(`Owes ${formatRM(RM(222) - RM(160.5))} · Sep (part), Oct, Nov`);
  });

  it("paid up, with part of the next months already in", () => {
    // Thirteen shares of RM 20 and RM 3 of change: November is made up (RM 2), RM 1 reaches December, January has only its share.
    const l = ledger([pay(1, "2026-04-20", 120), pay(1, "2026-08-02", 143)]);
    expect(l.owedNow).toBe(0);
    expect(l.upcoming.map((c) => [c.month, c.paid, c.remaining])).toEqual([["2026-12", RM(21), RM(1)], ["2027-01", RM(20), RM(2)]]);
    // December and January are in different years, so each says which.
    expect(standingText(l)).toEqual({ text: `Paid up · ${formatRM(RM(3))} more expected (Dec 26, Jan 27)`, tone: "ahead" });
    expect(expectedText(l)).toBe(`${formatRM(RM(3))} more expected (Dec 26, Jan 27)`);
  });

  it("settled, and paid whole months ahead", () => {
    expect(standingText(ledger([pay(1, "2026-10-05", 222)])).text).toBe("Paid up");
    expect(standingText(ledger([pay(1, "2026-10-05", 222 + 44)])).text).toBe("Paid ahead 2 months");
  });

  it("month names carry the year only when they span more than one", () => {
    expect(monthNames(["2026-10", "2026-11"])).toBe("Oct, Nov");
    expect(monthNames(["2026-12", "2027-01"])).toBe("Dec 26, Jan 27");
  });
});
