import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, billShares, billTurns, categories, recurringBills, transactions } from "@/db/schema";

// Real actions + real SQL on an in-memory database; only Next's plumbing is stubbed (see plan-actions.test.ts).
const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const RM = (n: number) => Math.round(n * 100);
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const readable = (url: string | null) => decodeURIComponent((url ?? "").replaceAll("+", " "));
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

let main: number, netflix: number, subsCat: number, otherInc: number, reimb: number, salaryCat: number;
const cat = (name: string) => h.db.select().from(categories).all().find((c) => c.name === name)!.id;

beforeEach(() => {
  return import("@/db/open").then(({ openDb }) => {
    h.db = openDb(":memory:");
    main = h.db.select().from(accounts).all().find((a) => a.type === "bank")!.id;
    subsCat = cat("Subscriptions");
    otherInc = cat("Other Income");
    reimb = cat("Reimbursements");
    salaryCat = cat("Salary");
    netflix = h.db.insert(recurringBills).values({ name: "Netflix", accountId: main, categoryId: subsCat, amountMin: RM(88.9), amountMax: RM(88.9) }).returning().get().id;
    // Netflix charged on the 4th, January to October
    for (let m = 1; m <= 10; m++) {
      h.db.insert(transactions).values({ date: `2026-${String(m).padStart(2, "0")}-04`, type: "expense", amount: RM(88.9), accountId: main, categoryId: subsCat, item: "Netflix", billId: netflix }).run();
    }
  });
});

/** Money in, as the importer records it: the bank's line is kept in `note`. */
const credit = (date: string, rm: number, note: string, categoryId = otherInc) =>
  h.db.insert(transactions).values({ date, type: "income", amount: RM(rm), accountId: main, categoryId, item: "Received", note }).returning().get().id;
const person = (over: Record<string, string> = {}) =>
  fd({ billId: String(netflix), name: "Jane", share: "22.25", startMonth: "2026-01", matchKeywords: "jane", active: "on", ...over });
const tx = (id: number) => h.db.select().from(transactions).where(eq(transactions.id, id)).get()!;
const shares = () => h.db.select().from(billShares).all();

describe("saveShare", () => {
  it("adds a person, and links the past money that is clearly theirs (and only theirs)", async () => {
    const janeLump = credit("2026-01-02", 133.5, "DUITNOW TO ACCOUNT 612772696 JANE A/L DOE Rms Oct25 to Mar26");
    const janeOne = credit("2026-08-05", 22.25, "DUITNOW TO ACCOUNT 55 JANE A/L DOE netflix");
    const ahmad = credit("2026-08-06", 22.25, "DUITNOW TO ACCOUNT 56 AHMAD BIN ALI");
    const salary = credit("2026-08-26", 5400, "IBG CREDIT ACME SDN BHD JANE", salaryCat); // not a candidate category

    const url = await redirected(
      (await import("@/app/actions/shares")).saveShare(person()),
    );
    expect(url).toBe("/plan/shared?linked=2");
    const [jane] = shares();
    expect(jane).toMatchObject({ name: "Jane", share: RM(22.25), startMonth: "2026-01", endMonth: null, matchKeywords: "jane", active: true, billId: netflix });
    // linked, re-filed as Reimbursements, named after the bill
    expect(tx(janeLump)).toMatchObject({ shareId: jane.id, categoryId: reimb, item: "Netflix share" });
    expect(tx(janeOne)).toMatchObject({ shareId: jane.id, categoryId: reimb });
    // someone else, and a salary line that merely contains her name, are left alone
    expect(tx(ahmad).shareId).toBeNull();
    expect(tx(salary)).toMatchObject({ shareId: null, categoryId: salaryCat });
  });

  it("editing a person updates them (no duplicate) and normalises their words", async () => {
    const { saveShare } = await import("@/app/actions/shares");
    await redirected(saveShare(person()));
    const id = shares()[0].id;
    await redirected(saveShare(person({ id: String(id), share: "30", matchKeywords: " Jane , DOE ,", endMonth: "2026-06" })));
    expect(shares()).toHaveLength(1);
    expect(shares()[0]).toMatchObject({ share: RM(30), matchKeywords: "jane, doe", endMonth: "2026-06" });
  });

  it.each([
    ["no amount", { share: "" }, /what they owe each month/],
    ["a zero share", { share: "0" }, /what they owe each month/],
    ["no name", { name: "  " }, /person's name/],
    ["a bad start month", { startMonth: "2026-13" }, /valid month/],
    ["leaving before joining", { startMonth: "2026-05", endMonth: "2026-02" }, /before they joined/],
    ["a bill that doesn't exist", { billId: "9999" }, /no longer exists/],
  ])("refuses %s, and saves nothing", async (_label, over, message) => {
    const url = await redirected((await import("@/app/actions/shares")).saveShare(person(over)));
    expect(readable(url)).toMatch(message);
    expect(shares()).toHaveLength(0);
  });
});

describe("assigning and unassigning payments by hand", () => {
  it("counts a payment towards someone and files it as Reimbursements", async () => {
    const { saveShare, assignPayment } = await import("@/app/actions/shares");
    await redirected(saveShare(person({ matchKeywords: "zzz-nobody" })));
    const id = credit("2026-03-03", 66.75, "DUITNOW TO ACCOUNT SOMEONE UNKNOWN");
    await redirected(assignPayment(fd({ txId: String(id), shareId: String(shares()[0].id) })));
    expect(tx(id)).toMatchObject({ shareId: shares()[0].id, categoryId: reimb, item: "Netflix share" });
  });

  it("only re-files vague money-in: a salary line keeps its category", async () => {
    const { saveShare, assignPayment } = await import("@/app/actions/shares");
    await redirected(saveShare(person()));
    const id = credit("2026-03-03", 50, "X", salaryCat);
    await redirected(assignPayment(fd({ txId: String(id), shareId: String(shares()[0].id) })));
    expect(tx(id).categoryId).toBe(salaryCat);
  });

  it("refuses spending, and a person who doesn't exist", async () => {
    const { saveShare, assignPayment } = await import("@/app/actions/shares");
    await redirected(saveShare(person()));
    const spend = h.db.select().from(transactions).where(eq(transactions.type, "expense")).get()!;
    expect(readable(await redirected(assignPayment(fd({ txId: String(spend.id), shareId: String(shares()[0].id) }))))).toMatch(/isn't a money-in/);
    const id = credit("2026-03-03", 10, "X");
    expect(readable(await redirected(assignPayment(fd({ txId: String(id), shareId: "999" }))))).toMatch(/who it is from/);
    expect(tx(id).shareId).toBeNull();
  });

  it("unassigning keeps the money recorded, just not counted towards anyone", async () => {
    const { saveShare, unassignPayment } = await import("@/app/actions/shares");
    const id = credit("2026-03-03", 22.25, "JANE");
    await redirected(saveShare(person()));
    expect(tx(id).shareId).not.toBeNull();
    await redirected(unassignPayment(fd({ txId: String(id) })));
    expect(tx(id)).toMatchObject({ shareId: null, type: "income", amount: RM(22.25) });
  });
});

describe("removing people and bills", () => {
  it("removing a person unlinks their payments instead of failing on them", async () => {
    const { saveShare, deleteShare } = await import("@/app/actions/shares");
    const id = credit("2026-03-03", 22.25, "JANE");
    await redirected(saveShare(person()));
    await redirected(deleteShare(fd({ id: String(shares()[0].id) })));
    expect(shares()).toHaveLength(0);
    expect(tx(id)).toMatchObject({ shareId: null, type: "income" });
  });

  it("deleting a bill takes its people with it, and leaves their payments as plain money in", async () => {
    const { saveShare } = await import("@/app/actions/shares");
    const { deleteBill } = await import("@/app/actions/plan");
    const id = credit("2026-03-03", 22.25, "JANE");
    await redirected(saveShare(person()));
    await redirected(deleteBill(fd({ id: String(netflix) })));
    expect(shares()).toHaveLength(0);
    expect(tx(id)).toMatchObject({ shareId: null, type: "income" });
  });
});

describe("getSharedBills: the view", () => {
  it("shows who has paid for which months, what is owed, and what the bill really costs you", async () => {
    const { saveShare } = await import("@/app/actions/shares");
    credit("2026-01-02", 133.5, "JANE A/L DOE six months"); // Jan-Jun
    credit("2026-08-05", 22.25, "AHMAD BIN ALI");
    await redirected(saveShare(person({ name: "Jane", matchKeywords: "jane" })));
    await redirected(saveShare(person({ name: "Ahmad", matchKeywords: "ahmad" })));
    await redirected(saveShare(person({ name: "Mei", matchKeywords: "mei" })));

    const { getSharedBills } = await import("@/lib/queries/shares");
    const page = await getSharedBills("2026-10-09");
    expect(page.bills).toHaveLength(1);
    const [b] = page.bills;
    expect(b.bill).toMatchObject({ id: netflix, name: "Netflix" });
    expect(b.months).toHaveLength(10);
    const by = Object.fromEntries(b.people.map((p) => [p.share.name, p]));
    expect(by.Jane).toMatchObject({ paidThrough: "2026-06", monthsOwed: 4, status: "owes" });
    expect(by.Ahmad).toMatchObject({ paidThrough: "2026-01", monthsOwed: 9 });
    expect(by.Mei).toMatchObject({ paid: 0, monthsOwed: 10, paidThrough: null });
    expect(b.owedToYou).toBe(RM(89) + RM(200.25) + RM(222.5));
    expect(b.yourMonthlyCost).toBe(RM(88.9) - 3 * RM(22.25));
    expect(page.owedToYou).toBe(b.owedToYou);
  });

  it("only counts charges up to today (a bill not yet charged this month isn't owed yet)", async () => {
    const { saveShare } = await import("@/app/actions/shares");
    await redirected(saveShare(person()));
    const { getSharedBills } = await import("@/lib/queries/shares");
    expect((await getSharedBills("2026-06-30")).bills[0].months).toHaveLength(6);
  });

  it("offers only amounts that could be a friend's payment, and shows the ones it can place first", async () => {
    const { saveShare } = await import("@/app/actions/shares");
    await redirected(saveShare(person({ matchKeywords: "jane" }))); // RM 22.25 a month: a payment is RM 22.25 to about RM 267
    const hint = credit("2026-09-01", 22.25, "DUITNOW JANE A/L DOE");
    const unknown = credit("2026-09-20", 160.2, "DUITNOW SOMEONE");
    const kwsp = credit("2026-09-25", 1000, "SVG GIRO CR KWSP");
    const tiny = credit("2026-09-26", 3, "PYMT VIA MYDEBIT REFUND");
    const { getSharedBills } = await import("@/lib/queries/shares");
    const ids = (await getSharedBills("2026-10-09")).unassigned.map((u) => u.id);
    expect(ids).toEqual([hint, unknown]); // the placeable one first; neither the RM 1,000 nor the RM 3.00
    expect(ids).not.toContain(kwsp);
    expect(ids).not.toContain(tiny);
  });

  it("lists money in that nobody has claimed, with a suggestion when one person fits", async () => {
    const { saveShare } = await import("@/app/actions/shares");
    await redirected(saveShare(person({ matchKeywords: "jane" })));
    const hint = credit("2026-09-09", 22.25, "DUITNOW JANE A/L DOE"); // would have been claimed on save: add it AFTER
    const stray = credit("2026-09-10", 155.5, "DUITNOW SHOBAN");
    const salary = credit("2026-08-26", 5400, "ACME", salaryCat);
    const { getSharedBills } = await import("@/lib/queries/shares");
    const page = await getSharedBills("2026-10-09");
    const byId = Object.fromEntries(page.unassigned.map((u) => [u.id, u]));
    expect(byId[hint].suggestedShareId).toBe(shares()[0].id);
    expect(byId[stray].suggestedShareId).toBeNull();
    expect(byId[salary]).toBeUndefined(); // a salary is never someone's payment
  });
});

describe("a bill paid in turns (Spotify): one person pays the whole month", () => {
  const turns = () => h.db.select().from(billTurns).all();
  const turnsOf = (billId: number) => Object.fromEntries(turns().filter((t) => t.billId === billId).map((t) => [t.month, t.shareId]));

  /** Spotify charged RM 30.90 on the 7th, January to October, shared by Ana and Ben (each created at RM 5.15 a month). */
  async function spotify() {
    const id = h.db.insert(recurringBills).values({ name: "Spotify", accountId: main, categoryId: subsCat, amountMin: RM(30.9), amountMax: RM(30.9) }).returning().get().id;
    for (let m = 1; m <= 10; m++) h.db.insert(transactions).values({ date: `2026-${String(m).padStart(2, "0")}-07`, type: "expense", amount: RM(30.9), accountId: main, categoryId: subsCat, item: "Spotify", billId: id }).run();
    return id;
  }
  const addPerson = async (billId: number, name: string) => {
    await redirected((await import("@/app/actions/shares")).saveShare(person({ billId: String(billId), name, share: "5.15", matchKeywords: name.toLowerCase() })));
    return shares().find((s) => s.name === name)!.id;
  };

  it("setSharing switches the bill to turns and makes each person's amount a whole turn; nothing received changes", async () => {
    const { setSharing } = await import("@/app/actions/shares");
    const sp = await spotify();
    const paid = credit("2026-05-02", 30.9, "DUITNOW ANA"); // received before she is added, so adding her links it
    const ana = await addPerson(sp, "Ana");
    expect(h.db.select().from(recurringBills).where(eq(recurringBills.id, sp)).get()!.sharing).toBe("monthly");
    await redirected(setSharing(fd({ billId: String(sp), sharing: "turns" })));
    expect(h.db.select().from(recurringBills).where(eq(recurringBills.id, sp)).get()!.sharing).toBe("turns");
    expect(shares().find((s) => s.id === ana)!.share).toBe(RM(30.9)); // a whole month, not a sixth
    expect(tx(paid)).toMatchObject({ shareId: ana, amount: RM(30.9) });
    // and back again: the mode changes, the people stay
    await redirected(setSharing(fd({ billId: String(sp), sharing: "monthly" })));
    expect(h.db.select().from(recurringBills).where(eq(recurringBills.id, sp)).get()!.sharing).toBe("monthly");
  });

  it("setSharing refuses an unknown way of splitting, or a bill that isn't there", async () => {
    const { setSharing } = await import("@/app/actions/shares");
    const sp = await spotify();
    expect(readable(await redirected(setSharing(fd({ billId: String(sp), sharing: "weekly" }))))).toMatch(/how the bill is split/);
    expect(readable(await redirected(setSharing(fd({ billId: "9999", sharing: "turns" }))))).toMatch(/no longer exists/);
    expect(h.db.select().from(recurringBills).where(eq(recurringBills.id, sp)).get()!.sharing).toBe("monthly");
  });

  it("saveTurns plans whose month is whose: you, a person, or nobody yet; only the months it names are touched", async () => {
    const { saveTurns } = await import("@/app/actions/shares");
    const sp = await spotify();
    const [ana, ben] = [await addPerson(sp, "Ana"), await addPerson(sp, "Ben")];
    await redirected(saveTurns(fd({ billId: String(sp), "turn:2026-03": "you", "turn:2026-04": String(ben), "turn:2026-05": String(ana), "turn:2026-06": "" })));
    expect(turnsOf(sp)).toEqual({ "2026-03": null, "2026-04": ben, "2026-05": ana }); // June stays unplanned
    // changing one month replaces it (one person per month); an unnamed month is left as it was
    await redirected(saveTurns(fd({ billId: String(sp), "turn:2026-04": String(ana), "turn:2026-05": "" })));
    expect(turnsOf(sp)).toEqual({ "2026-03": null, "2026-04": ana });
  });

  it("saveTurns refuses a bad month or someone who isn't on the bill, and saves nothing", async () => {
    const { saveTurns } = await import("@/app/actions/shares");
    const sp = await spotify();
    await addPerson(sp, "Ana");
    const jane = await addPerson(netflix, "Jane"); // on Netflix, not Spotify
    expect(readable(await redirected(saveTurns(fd({ billId: String(sp), "turn:2026-04": String(jane) }))))).toMatch(/isn't on this bill/);
    expect(readable(await redirected(saveTurns(fd({ billId: String(sp), "turn:2026-13": "you" }))))).toMatch(/valid months/);
    expect(readable(await redirected(saveTurns(fd({ billId: "9999", "turn:2026-04": "you" }))))).toMatch(/no longer exists/);
    expect(turns()).toHaveLength(0);
  });

  it("removing a person takes their turns with them; deleting the bill takes every turn", async () => {
    const { saveTurns, deleteShare } = await import("@/app/actions/shares");
    const { deleteBill } = await import("@/app/actions/plan");
    const sp = await spotify();
    const [ana, ben] = [await addPerson(sp, "Ana"), await addPerson(sp, "Ben")];
    await redirected(saveTurns(fd({ billId: String(sp), "turn:2026-03": "you", "turn:2026-04": String(ana), "turn:2026-05": String(ben) })));
    await redirected(deleteShare(fd({ id: String(ana) })));
    expect(turnsOf(sp)).toEqual({ "2026-03": null, "2026-05": ben });
    await redirected(deleteBill(fd({ id: String(sp) })));
    expect(turns()).toHaveLength(0);
  });

  it("getSharedBills shows the bill as a rotation: a person who has paid their turn owes nothing, one whose month has come owes it", async () => {
    const { setSharing, saveTurns } = await import("@/app/actions/shares");
    const sp = await spotify();
    credit("2026-05-02", 30.9, "DUITNOW ANA"); // Ana pays for HER turn (April, paid in May)
    credit("2026-05-03", 61.8, "DUITNOW BEN"); // Ben pays two turns in one transfer
    const [ana, ben] = [await addPerson(sp, "Ana"), await addPerson(sp, "Ben")];
    await redirected(setSharing(fd({ billId: String(sp), sharing: "turns" })));
    await redirected(saveTurns(fd({ billId: String(sp), "turn:2026-03": "you", "turn:2026-04": String(ana), "turn:2026-05": String(ben), "turn:2026-08": String(ben), "turn:2026-09": "you", "turn:2026-10": String(ana), "turn:2026-11": String(ben) })));

    const { getSharedBills } = await import("@/lib/queries/shares");
    const page = await getSharedBills("2026-10-09");
    const view = page.bills.find((b) => b.bill.id === sp)!;
    expect(view.bill.sharing).toBe("turns");
    expect(view.people).toEqual([]); // the equal-parts ledger is not used for it
    const r = view.rotation!;
    const byName = Object.fromEntries(r.people.map((p) => [p.share.name, p]));
    // Ana: April paid (the RM 30.90 on 2 May); October has come round and nothing is in
    expect(byName.Ana.turns.map((c) => [c.month, c.state])).toEqual([["2026-04", "paid"], ["2026-10", "due"]]);
    // Ben: his RM 61.80 settled May and August; November is still to come
    expect(byName.Ben.turns.map((c) => [c.month, c.state])).toEqual([["2026-05", "paid"], ["2026-08", "paid"], ["2026-11", "upcoming"]]);
    expect(r.dueNow).toEqual([{ month: "2026-10", shareId: ana, amount: RM(30.9) }]);
    expect(view.owedToYou).toBe(RM(30.9));
    expect(page.owedToYou).toBe(RM(30.9)); // it feeds the page's total
    expect(r.unmatched).toBe(0);
    void ben;
  });
});

describe("coverMonth: whoever says they'll cover a month gets it", () => {
  const turnsOf = (billId: number) => Object.fromEntries(h.db.select().from(billTurns).all().filter((t) => t.billId === billId).map((t) => [t.month, t.shareId]));
  async function setup() {
    const sp = h.db.insert(recurringBills).values({ name: "Spotify", accountId: main, categoryId: subsCat, amountMin: RM(30.9), amountMax: RM(30.9), sharing: "turns" }).returning().get().id;
    for (let m = 1; m <= 10; m++) h.db.insert(transactions).values({ date: `2026-${String(m).padStart(2, "0")}-07`, type: "expense", amount: RM(30.9), accountId: main, categoryId: subsCat, item: "Spotify", billId: sp }).run();
    const { saveShare } = await import("@/app/actions/shares");
    for (const name of ["Ana", "Ben"]) await redirected(saveShare(person({ billId: String(sp), name, share: "30.90", matchKeywords: name.toLowerCase() })));
    const [ana, ben] = shares().filter((s) => s.billId === sp).map((s) => s.id);
    return { sp, ana, ben };
  }

  it("gives the person the month, with no other month touched", async () => {
    const { coverMonth, saveTurns } = await import("@/app/actions/shares");
    const { sp, ana, ben } = await setup();
    await redirected(saveTurns(fd({ billId: String(sp), "turn:2026-09": "you", "turn:2026-11": String(ben) })));
    expect(await redirected(coverMonth(fd({ billId: String(sp), shareId: String(ana), month: "2026-10" })))).toBe("/plan/shared");
    expect(turnsOf(sp)).toEqual({ "2026-09": null, "2026-10": ana, "2026-11": ben });
  });

  it("the money that had no month then settles it (the one-tap path from 'sent RM 30.90, month not set')", async () => {
    const { coverMonth } = await import("@/app/actions/shares");
    credit("2026-10-12", 30.9, "DUITNOW TO ACCOUNT 1 ANA Spotify"); // arrives BEFORE she is given the month
    const { sp, ana } = await setup(); // saving her links the payment already received
    const { getSharedBills } = await import("@/lib/queries/shares");
    const before = (await getSharedBills("2026-10-12")).bills.find((b) => b.bill.id === sp)!.rotation!;
    expect(before.people.find((p) => p.share.id === ana)!.leftovers).toHaveLength(1);
    expect(before.owedToYou).toBe(0);

    await redirected(coverMonth(fd({ billId: String(sp), shareId: String(ana), month: "2026-10" })));
    const after = (await getSharedBills("2026-10-12")).bills.find((b) => b.bill.id === sp)!.rotation!;
    expect(after.people.find((p) => p.share.id === ana)).toMatchObject({ leftovers: [], unmatched: 0, turns: [expect.objectContaining({ month: "2026-10", state: "paid" })] });
    expect(after.owedToYou).toBe(0);
  });

  it("refuses a month somebody already has, a stranger, and a bad month: nothing changes", async () => {
    const { coverMonth, saveTurns } = await import("@/app/actions/shares");
    const { sp, ana, ben } = await setup();
    await redirected(saveTurns(fd({ billId: String(sp), "turn:2026-10": String(ben) })));
    expect(readable(await redirected(coverMonth(fd({ billId: String(sp), shareId: String(ana), month: "2026-10" }))))).toMatch(/already has that month/);
    expect(readable(await redirected(coverMonth(fd({ billId: String(sp), shareId: "9999", month: "2026-11" }))))).toMatch(/isn't on this bill/);
    expect(readable(await redirected(coverMonth(fd({ billId: String(sp), shareId: String(ana), month: "2026-13" }))))).toMatch(/valid month/);
    expect(turnsOf(sp)).toEqual({ "2026-10": ben });
  });
});
