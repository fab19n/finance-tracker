import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, billShares, categories, recurringBills, transactions } from "@/db/schema";
import { splitClaims, suggestedPayment, type ClaimRow } from "@/lib/plan/share-claims";

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

let main: number, invest: number, netflix: number, jane: number, subsCat: number, otherInc: number, reimb: number;
const cat = (name: string) => h.db.select().from(categories).all().find((c) => c.name === name)!.id;
const tx = (id: number) => h.db.select().from(transactions).where(eq(transactions.id, id)).get()!;

beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  main = h.db.select().from(accounts).all().find((a) => a.type === "bank")!.id;
  invest = h.db.insert(accounts).values({ name: "Fund", type: "investment" }).returning().get().id;
  subsCat = cat("Subscriptions");
  otherInc = cat("Other Income");
  reimb = cat("Reimbursements");
  netflix = h.db.insert(recurringBills).values({ name: "Netflix", accountId: main, categoryId: subsCat, amountMin: RM(88.9), amountMax: RM(88.9) }).returning().get().id;
  for (let m = 1; m <= 10; m++) {
    h.db.insert(transactions).values({ date: `2026-${String(m).padStart(2, "0")}-04`, type: "expense", amount: RM(88.9), accountId: main, categoryId: subsCat, item: "Netflix", billId: netflix }).run();
  }
  jane = h.db.insert(billShares).values({ billId: netflix, name: "Jane", share: RM(22.25), startMonth: "2026-01", matchKeywords: "jane", active: true, sortOrder: 0 }).returning().get().id;
});

const pay = (o: Record<string, string> = {}) => fd({ shareId: String(jane), amount: "22.25", date: "2026-10-09", accountId: String(main), ...o });
const incomeRow = (over: Partial<typeof transactions.$inferInsert> = {}) =>
  h.db.insert(transactions).values({ date: "2026-10-05", type: "income", amount: RM(22.25), accountId: main, categoryId: otherInc, item: "Received", note: "DUITNOW", ...over }).returning().get().id;

describe("splitClaims", () => {
  const row = (id: number, amount: number, date: string, categoryName: string): ClaimRow => ({ id, amount, date, categoryName, note: null, item: "x" });
  const people = [{ id: 1, name: "Jane", share: RM(22.25), matchKeywords: null, active: true }];
  it("always offers Reimbursements, however odd the amount or old the date", () => {
    const r = splitClaims([row(1, RM(3), "2020-01-01", "Reimbursements"), row(2, RM(5000), "2026-10-01", "Reimbursements")], people, "2026-10-09");
    expect(r.main.map((c) => c.id).sort()).toEqual([1, 2]);
    expect(r.other).toEqual([]);
  });
  it("keeps the window for other categories but offers the rest behind 'other'", () => {
    const r = splitClaims([row(1, RM(22.25), "2026-10-01", "Other Income"), row(2, RM(3), "2026-10-01", "Other Income"), row(3, RM(22.25), "2024-01-01", "Gift Received")], people, "2026-10-09");
    expect(r.main.map((c) => c.id)).toEqual([1]);
    expect(r.other.map((c) => c.id).sort()).toEqual([2, 3]);
  });
  it("offers nothing when nobody is sharing", () => {
    expect(splitClaims([row(1, 100, "2026-10-01", "Reimbursements")], [{ ...people[0], active: false }], "2026-10-09")).toEqual({ main: [], other: [] });
  });
  it("suggests what they owe, else what is expected, else a month", () => {
    expect(suggestedPayment({ owedNow: 5, expectedNext: 9 }, 7)).toBe(5);
    expect(suggestedPayment({ owedNow: 0, expectedNext: 9 }, 7)).toBe(9);
    expect(suggestedPayment({ owedNow: 0, expectedNext: 0 }, 7)).toBe(7);
  });
});

describe("recordSharePayment: Mark paid", () => {
  it("records money in under Reimbursements, linked to the person, and the ledger counts it", async () => {
    const { recordSharePayment } = await import("@/app/actions/shares");
    const { getSharedBills } = await import("@/lib/queries/shares");
    const before = (await getSharedBills("2026-10-09")).bills[0].people[0].owedNow;
    expect(await redirected(recordSharePayment(pay({ amount: "44.50" })))).toBe("/plan/shared?saved=counted");
    const row = h.db.select().from(transactions).where(eq(transactions.shareId, jane)).all();
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ type: "income", amount: RM(44.5), categoryId: reimb, accountId: main, item: "Netflix share", date: "2026-10-09" });
    const after = (await getSharedBills("2026-10-09")).bills[0].people[0].owedNow;
    expect(before - after).toBe(RM(44.5));
  });
  it("refuses a double tap (same payment in the last minute) but not a different amount", async () => {
    const { recordSharePayment } = await import("@/app/actions/shares");
    await redirected(recordSharePayment(pay()));
    expect(await redirected(recordSharePayment(pay()))).toContain("error=");
    expect(h.db.select().from(transactions).where(eq(transactions.shareId, jane)).all()).toHaveLength(1);
    await redirected(recordSharePayment(pay({ amount: "10" })));
    expect(h.db.select().from(transactions).where(eq(transactions.shareId, jane)).all()).toHaveLength(2);
  });
  it("validates the person, amount, date and account, writing nothing", async () => {
    const { recordSharePayment } = await import("@/app/actions/shares");
    const count = () => h.db.select().from(transactions).where(eq(transactions.type, "income")).all().length;
    const bads: Record<string, string>[] = [{ amount: "0" }, { amount: "abc" }, { amount: "99999999999" }, { date: "2026-02-30" }, { date: "" }, { accountId: String(invest) }, { accountId: "9999" }, { shareId: "9999" }];
    for (const bad of bads) {
      expect(readable(await redirected(recordSharePayment(pay(bad))))).toContain("error=");
    }
    h.db.update(billShares).set({ active: false }).where(eq(billShares.id, jane)).run();
    expect(await redirected(recordSharePayment(pay()))).toContain("error=");
    expect(count()).toBe(0);
  });
  it("works for a bill paid in turns: the payment lands on their turn", async () => {
    const { recordSharePayment, setSharing, saveTurns } = await import("@/app/actions/shares");
    const { getSharedBills } = await import("@/lib/queries/shares");
    await redirected(setSharing(fd({ billId: String(netflix), sharing: "turns" })));
    await redirected(saveTurns(fd({ billId: String(netflix), "turn:2026-09": String(jane) })));
    await redirected(recordSharePayment(pay({ amount: "88.90" })));
    const r = (await getSharedBills("2026-10-09")).bills[0].rotation!;
    expect(r.people[0].turns[0]).toMatchObject({ month: "2026-09", state: "paid" });
    expect(r.owedToYou).toBe(0);
  });
});

describe("assignPayment / unassignPayment: Not theirs", () => {
  it("gives back the exact original item and category", async () => {
    const { assignPayment, unassignPayment } = await import("@/app/actions/shares");
    const id = incomeRow({ item: "Bank credit 123", note: "JANE" });
    await redirected(assignPayment(fd({ txId: String(id), shareId: String(jane) })));
    expect(tx(id)).toMatchObject({ shareId: jane, item: "Netflix share", categoryId: reimb, sharePrevItem: "Bank credit 123", sharePrevCategoryId: otherInc });
    await redirected(unassignPayment(fd({ txId: String(id) })));
    expect(tx(id)).toMatchObject({ shareId: null, item: "Bank credit 123", categoryId: otherInc, sharePrevItem: null, sharePrevCategoryId: null });
  });
  it("does not undo an edit the user made after the payment was counted", async () => {
    const { assignPayment, unassignPayment } = await import("@/app/actions/shares");
    const id = incomeRow({ item: "Bank credit 123" });
    await redirected(assignPayment(fd({ txId: String(id), shareId: String(jane) })));
    // the owner renames it and files it under another category after it was counted
    h.db.update(transactions).set({ item: "Jane, October", categoryId: otherInc }).where(eq(transactions.id, id)).run();
    await redirected(unassignPayment(fd({ txId: String(id) })));
    expect(tx(id)).toMatchObject({ shareId: null, item: "Jane, October", categoryId: otherInc });
  });
  it("keeps the first saved original when a payment is moved from one person to another", async () => {
    const { assignPayment } = await import("@/app/actions/shares");
    const ben = h.db.insert(billShares).values({ billId: netflix, name: "Ben", share: RM(22.25), startMonth: "2026-01", active: true, sortOrder: 1 }).returning().get().id;
    const id = incomeRow({ item: "Bank credit 123" });
    await redirected(assignPayment(fd({ txId: String(id), shareId: String(jane) })));
    await redirected(assignPayment(fd({ txId: String(id), shareId: String(ben) })));
    expect(tx(id)).toMatchObject({ shareId: ben, sharePrevItem: "Bank credit 123", sharePrevCategoryId: otherInc });
  });
  it("leaves an entry that was never counted untouched", async () => {
    const { unassignPayment } = await import("@/app/actions/shares");
    const id = incomeRow({ item: "Salary-ish" });
    const before = tx(id);
    await redirected(unassignPayment(fd({ txId: String(id) })));
    expect(tx(id)).toEqual(before);
  });
  it("a Mark-paid entry goes back to money in, still recorded, ready to be claimed again", async () => {
    const { recordSharePayment, unassignPayment } = await import("@/app/actions/shares");
    await redirected(recordSharePayment(pay()));
    const id = h.db.select().from(transactions).where(eq(transactions.shareId, jane)).get()!.id;
    await redirected(unassignPayment(fd({ txId: String(id) })));
    expect(tx(id)).toMatchObject({ shareId: null, type: "income", categoryId: reimb });
    const { getSharedBills } = await import("@/lib/queries/shares");
    expect((await getSharedBills("2026-10-09")).unassigned.map((u) => u.id)).toContain(id);
  });
  it("deleting a person still frees their payments", async () => {
    const { assignPayment, deleteShare } = await import("@/app/actions/shares");
    const id = incomeRow();
    await redirected(assignPayment(fd({ txId: String(id), shareId: String(jane) })));
    await redirected(deleteShare(fd({ id: String(jane) })));
    expect(tx(id).shareId).toBeNull();
  });
});

describe("the claim list on the page", () => {
  it("always offers a hand-typed Reimbursements entry, and puts odd money in 'other'", async () => {
    const { getSharedBills } = await import("@/lib/queries/shares");
    const odd = incomeRow({ categoryId: reimb, amount: RM(3), date: "2024-02-02", item: "Paid back", note: null });
    const strange = incomeRow({ categoryId: otherInc, amount: RM(3), note: null });
    const page = await getSharedBills("2026-10-09");
    expect(page.unassigned.map((u) => u.id)).toContain(odd);
    expect(page.unassigned.map((u) => u.id)).not.toContain(strange);
    expect(page.unassignedOther.map((u) => u.id)).toContain(strange);
    expect(page.defaultAccountId).toBe(main);
    expect(page.accounts.map((a) => a.id)).not.toContain(invest);
  });
});
