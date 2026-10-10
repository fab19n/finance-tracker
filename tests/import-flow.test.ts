import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, billShares, categories, importRules, recurringBills, transactions } from "@/db/schema";
import type { CommitRow, PreviewOk, PreviewResult } from "@/lib/import/api-types";
import { commitRows } from "@/lib/import/commit";
import { buildPreview } from "@/lib/import/preview";
import { makePdf, printoutPdf, tablePage } from "./pdf-fixture";

// The real import pipeline (parse -> classify -> commit) against a real in-memory database.
const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));

const RM = (n: number) => Math.round(n * 100);
let main: number, savings: number, cash: number;
const cat = (name: string) => h.db.select().from(categories).where(eq(categories.name, name)).get()!.id;

beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  const all = h.db.select().from(accounts).all();
  main = all.find((a) => a.type === "bank")!.id;
  cash = all.find((a) => a.type === "cash")!.id;
  h.db.update(accounts).set({ purpose: "spending", name: "Salary & Bills" }).where(eq(accounts.id, main)).run();
  savings = h.db.insert(accounts).values({ name: "Savings", type: "bank", purpose: "savings" }).returning().get().id;
  h.db.insert(recurringBills).values([
    { name: "Rent", accountId: main, categoryId: cat("Rent / Housing"), amountMin: RM(950), amountMax: RM(980), dueDay: 1 }, // no keywords: paid to a person
    { name: "Netflix", accountId: main, categoryId: cat("Subscriptions"), amountMin: RM(88.9), amountMax: RM(88.9), dueDay: 8, matchKeywords: "netflix" },
  ]).run();
});

const MAIN_STATEMENT = `
STATEMENT DATE : 30/09/26
ENTRY DATE TRANSACTION DESCRIPTION TRANSACTION AMOUNT STATEMENT BALANCE
BEGINNING BALANCE 1,200.00
28/08/26 SALARY ACME SDN BHD 5,400.00+ 6,600.00
28/08/26 TRANSFER TO A/C 4,200.00- 2,400.00
MR TAN
01/09/26 FPX PAYMENT RENT 965.00- 1,435.00
08/09/26 NETFLIX.COM 88.90- 1,346.10
09/09/26 PETRONAS DAGANGAN 62.50- 1,283.60
10/09/26 ATM WITHDRAWAL KLCC 300.00- 983.60
12/09/26 DUITNOW QR MAKAN ENAK 18.00- 965.60
`.trim();

async function preview(over: Partial<Parameters<typeof buildPreview>[1]> = {}): Promise<PreviewOk> {
  const r: PreviewResult = await buildPreview(h.db, { accountId: main, text: MAIN_STATEMENT, expectedIncome: RM(5400), ...over });
  if (!r.ok) throw new Error(`preview failed: ${r.error}`);
  return r;
}

/** What a user would send after reviewing: every proposal accepted as-is, unless changed. */
function accept(p: PreviewOk, edit: (r: PreviewOk["rows"][number]) => Partial<CommitRow> = () => ({})): CommitRow[] {
  return p.rows.map((r) => ({
    key: r.key, date: r.date, amount: r.amount, description: r.description, kind: r.proposal.kind,
    categoryId: r.proposal.categoryId, item: r.proposal.item, billId: r.proposal.billId,
    transferAccountId: r.proposal.transferAccountId, remember: false, ...edit(r),
  }));
}
const txs = () => h.db.select().from(transactions).all();

describe("preview: reading and proposing", () => {
  it("reads the statement, proves it against the running balance, and proposes each line", async () => {
    const p = await preview();
    expect(p.mode).toBe("text");
    expect(p.check).toMatchObject({ checked: 7, matched: 7, mismatches: [], openingVerified: true });
    expect(p.dateRange).toEqual({ from: "2026-08-28", to: "2026-09-12" });
    const byDesc = (s: string) => p.rows.find((r) => r.description.includes(s))!.proposal;

    // The description says "salary", so it is recognised outright (the "close to your pay?" guess is for silent credits).
    expect(byDesc("SALARY")).toMatchObject({ kind: "income", categoryId: cat("Salary"), source: "builtin", confidence: "high" });
    // "RENT" in the text matches the Rent bill by name, and 965 is inside its 950-980 range.
    expect(byDesc("RENT")).toMatchObject({ kind: "expense", item: "Rent", source: "bill", confidence: "high" });
    expect(byDesc("RENT").billId).not.toBeNull();
    expect(byDesc("NETFLIX")).toMatchObject({ item: "Netflix", source: "bill", confidence: "high" });
    expect(byDesc("PETRONAS")).toMatchObject({ categoryId: cat("Transport & Fuel"), item: "Petrol", source: "builtin" });
    expect(byDesc("ATM")).toMatchObject({ kind: "transfer", transferAccountId: cash }); // cash out of the bank is not spending
    // an unrecognised QR payment this small is assumed to be food, but still flagged as a guess
    expect(byDesc("MAKAN")).toMatchObject({ kind: "expense", categoryId: cat("Eating Out"), item: "Makan Enak", source: "default", confidence: "low" });
  });

  it("counts what needs a human look", async () => {
    const p = await preview();
    // Only the lines we genuinely can't know: the unrecognised QR payment and the 'TRANSFER TO A/C' (is it your own account?)
    expect(p.stats).toMatchObject({ total: 7, duplicates: 0, fresh: 7, needsReview: 2 });
    expect(p.rows.filter((r) => r.proposal.confidence === "low").map((r) => r.description)).toEqual([
      "TRANSFER TO A/C MR TAN",
      "DUITNOW QR MAKAN ENAK",
    ]);
  });

  it("offers the opening balance only for an account with no entries yet", async () => {
    const p = await preview();
    expect(p.account).toMatchObject({ existingEntries: 0, openingBalance: 0 });
    expect(p.openingBalance).toBe(RM(1200));
  });

  describe("the direction of a statement's OLDEST line (no balance before it to prove it)", () => {
    // No opening balance stated, no signs: line 1 could be money in or out.
    const UNSTATED = "01/09/26 MYSTERY PAYMENT 50.00 1,050.00\n02/09/26 CORNER SHOP 30.00 1,020.00";
    const booksHold = (openingRM: number) => {
      h.db.update(accounts).set({ openingBalance: RM(openingRM) }).where(eq(accounts.id, main)).run();
      h.db.insert(transactions).values({ date: "2026-08-30", type: "expense", amount: RM(100), accountId: main, categoryId: cat("Groceries") }).run();
    };

    it("is worked out from the books when they hold the balance from just before: only one direction adds up", async () => {
      booksHold(1100); // 1,100 - 100 = 1,000 before 1 Sep; printed 1,050 after the line, so it was +50, not -50
      const p = await preview({ text: UNSTATED });
      expect(p.rows[0]).toMatchObject({ amount: RM(50), signedBy: "balance" });
      expect(p.openingBalance).toBe(RM(1000));
      expect(p.check).toMatchObject({ firstRowGuessed: false, mismatches: [] });
      expect(p.warnings.join(" ")).not.toMatch(/guess/);
    });

    it("stays a flagged guess when the books are NOT in step with the bank (neither direction adds up)", async () => {
      booksHold(5000);
      const p = await preview({ text: UNSTATED });
      expect(p.rows[0]).toMatchObject({ amount: -RM(50), signedBy: "guess" });
      expect(p.check.firstRowGuessed).toBe(true);
      expect(p.warnings.join(" ")).toMatch(/first row is a guess/);
    });

    it("stays a flagged guess on an account with no history to go by", async () => {
      const p = await preview({ text: UNSTATED });
      expect(p.check.firstRowGuessed).toBe(true);
      expect(p.rows[0].signedBy).toBe("guess");
    });
  });

  describe("starting from a chosen date", () => {
    it("leaves earlier lines out, and the starting balance becomes the bank's balance just before the first line kept", async () => {
      const p = await preview({ startDate: "2026-09-08" });
      expect(p.leftOut).toBe(3); // the salary, the transfer and the rent
      expect(p.rows.map((r) => r.date)).toEqual(["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-12"]);
      expect(p.openingBalance).toBe(RM(1435)); // what the statement printed after the rent line
      expect(p.dateRange).toEqual({ from: "2026-09-08", to: "2026-09-12" });
    });

    it("keeps each line's fingerprint, so a partial import and a full import of the same file recognise each other", async () => {
      const full = await preview();
      const partial = await preview({ startDate: "2026-09-08" });
      expect(partial.rows.map((r) => r.key)).toEqual(full.rows.slice(3).map((r) => r.key));
      commitRows(h.db, { accountId: main, rows: accept(partial), setOpeningBalance: null });
      const again = await preview();
      expect(again.rows.map((r) => r.proposal.source === "duplicate")).toEqual([false, false, false, true, true, true, true]);
    });

    it("with the starting balance applied, the app ends on the bank's own closing balance", async () => {
      const p = await preview({ startDate: "2026-09-08" });
      const res = commitRows(h.db, { accountId: main, rows: accept(p), setOpeningBalance: p.openingBalance });
      expect(res).toMatchObject({ ok: true, openingSet: true });
      const opening = h.db.select().from(accounts).where(eq(accounts.id, main)).get()!.openingBalance;
      const net = txs().reduce((s, t) => s + (t.type === "income" ? t.amount : t.type === "expense" || (t.type === "transfer" && t.accountId === main) ? -t.amount : 0), 0);
      expect(opening + net).toBe(RM(965.6)); // the last balance printed on the statement
    });

    it("a start date on or before the first line changes nothing", async () => {
      const p = await preview({ startDate: "2026-08-01" });
      expect(p.leftOut).toBe(0);
      expect(p.rows).toHaveLength(7);
      expect(p.openingBalance).toBe(RM(1200));
    });

    it("says so plainly when every line is earlier than the start date", async () => {
      const r = await buildPreview(h.db, { accountId: main, text: MAIN_STATEMENT, expectedIncome: RM(5400), startDate: "2027-01-01" });
      expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/before 2027-01-01/) });
    });
  });
});

describe("commit: saving the reviewed rows", () => {
  it("saves everything as the right kind of entry, linked to bills, with transfers in the right direction", async () => {
    const p = await preview();
    const rows = accept(p, (r) =>
      r.description.startsWith("TRANSFER TO A/C")
        ? { kind: "transfer", transferAccountId: savings, categoryId: null, remember: true, item: "To savings" }
        : r.description.includes("MAKAN")
          ? { categoryId: cat("Eating Out"), item: "QR meal", remember: true }
          : {},
    );
    const res = commitRows(h.db, { accountId: main, rows, setOpeningBalance: p.openingBalance });
    expect(res).toMatchObject({ ok: true, imported: 7, skipped: 0, transfers: 2, rulesSaved: 2, openingSet: true });

    const all = txs();
    expect(all).toHaveLength(7);
    // salary in, spending out
    expect(all.find((t) => t.item === "Salary")).toMatchObject({ type: "income", amount: RM(5400), accountId: main });
    expect(all.find((t) => t.item === "Netflix")).toMatchObject({ type: "expense", amount: RM(88.9), billId: expect.any(Number), categoryId: cat("Subscriptions") });
    // the payday transfer leaves the main account for savings; the ATM withdrawal for cash
    expect(all.find((t) => t.item === "To savings")).toMatchObject({ type: "transfer", amount: RM(4200), accountId: main, toAccountId: savings, categoryId: null });
    expect(all.find((t) => t.item === "ATM withdrawal")).toMatchObject({ type: "transfer", amount: RM(300), accountId: main, toAccountId: cash });
    // the original bank wording is kept in the note, and every row has a unique fingerprint
    expect(all.find((t) => t.item === "Petrol")!.note).toBe("PETRONAS DAGANGAN");
    expect(new Set(all.map((t) => t.importKey)).size).toBe(7);

    // ...and the books now match the bank: opening 1,200.00 + all of it = the statement's closing balance
    const { getAccountBalances } = await import("@/lib/queries/accounts");
    const balance = (await getAccountBalances()).find((a) => a.id === main)!.balance;
    expect(balance).toBe(RM(965.6));
  });

  it("remembers what you taught it, and uses it next time", async () => {
    const p = await preview();
    commitRows(h.db, {
      accountId: main,
      rows: accept(p, (r) => (r.description.includes("MAKAN") ? { categoryId: cat("Eating Out"), item: "QR meal", remember: true } : {})),
      setOpeningBalance: null,
    });
    // the pattern is the payee, not the bank's "DUITNOW QR" wrapper, so it can't swallow every other QR payment
    expect(h.db.select().from(importRules).all()).toMatchObject([{ pattern: "makan enak", kind: "expense", categoryId: cat("Eating Out"), item: "QR meal" }]);

    const next = await preview({ text: "BEGINNING BALANCE 100.00\n20/10/26 DUITNOW QR MAKAN ENAK 99887 12.00- 88.00", accountId: main });
    expect(next.rows[0].proposal).toMatchObject({ source: "rule", confidence: "high", categoryId: cat("Eating Out"), item: "QR meal" });
  });

  it("the latest decision for a pattern wins", async () => {
    const p = await preview();
    const only = p.rows.filter((r) => r.description.includes("MAKAN"));
    for (const cname of ["Groceries", "Eating Out"]) {
      commitRows(h.db, { accountId: main, rows: only.map((r) => ({ ...accept({ ...p, rows: [r] })[0], key: `k-${cname}`, categoryId: cat(cname), remember: true })), setOpeningBalance: null });
    }
    expect(h.db.select().from(importRules).all()).toHaveLength(1);
    expect(h.db.select().from(importRules).get()!.categoryId).toBe(cat("Eating Out"));
  });

  it("a transfer you send somewhere else never re-points the existing rule for that name", async () => {
    // "MR TAN" always meant Savings; today's one went to the e-wallet. Remembering that must not flip the rule.
    h.db.insert(importRules).values({ pattern: "mr tan", kind: "transfer", transferAccountId: savings }).run();
    const p = await preview();
    const tan = p.rows.filter((r) => r.description.startsWith("TRANSFER TO A/C"));
    const res = commitRows(h.db, { accountId: main, rows: accept(p, (r) => (tan.includes(r) ? { kind: "transfer" as const, transferAccountId: cash, categoryId: null, remember: true } : {})), setOpeningBalance: null });
    expect(res).toMatchObject({ ok: true, rulesSaved: 0 });
    expect(h.db.select().from(importRules).all()).toMatchObject([{ pattern: "mr tan", kind: "transfer", transferAccountId: savings }]);
    // the entry itself still went where you said
    expect(txs().find((t) => (t.note ?? "").includes("MR TAN"))).toMatchObject({ type: "transfer", toAccountId: cash });
  });

  it("still learns a transfer rule for a name that has none, or the same destination again", async () => {
    const p = await preview();
    const tan = (r: PreviewOk["rows"][number]) => r.description.startsWith("TRANSFER TO A/C");
    const toSavings = (r: PreviewOk["rows"][number]) => (tan(r) ? { kind: "transfer" as const, transferAccountId: savings, categoryId: null, remember: true } : {});
    expect(commitRows(h.db, { accountId: main, rows: accept(p, toSavings), setOpeningBalance: null })).toMatchObject({ ok: true, rulesSaved: 1 });
    expect(h.db.select().from(importRules).all()).toMatchObject([{ pattern: "mr tan", kind: "transfer", transferAccountId: savings }]);
    // same destination again: allowed (and idempotent)
    const q = await preview({ text: "BEGINNING BALANCE 100.00\n20/10/26 TRANSFER TO A/C 555 100.00- 0.00\nMR TAN" });
    expect(commitRows(h.db, { accountId: main, rows: accept(q, toSavings), setOpeningBalance: null })).toMatchObject({ ok: true, rulesSaved: 1 });
    expect(h.db.select().from(importRules).all()).toHaveLength(1);
  });
});

describe("re-importing and overlapping statements are safe", () => {
  it("importing the same statement twice adds nothing the second time", async () => {
    const first = await preview();
    commitRows(h.db, { accountId: main, rows: accept(first), setOpeningBalance: null });
    const again = await preview();
    expect(again.stats).toMatchObject({ total: 7, duplicates: 7, fresh: 0 });
    expect(again.rows.every((r) => r.proposal.kind === "skip")).toBe(true);
    expect(commitRows(h.db, { accountId: main, rows: accept(again), setOpeningBalance: null })).toMatchObject({ ok: true, imported: 0 });
    expect(txs()).toHaveLength(7);
  });

  it("a double-click can't create duplicates either: rows already saved are skipped at commit time", async () => {
    const p = await preview();
    const rows = accept(p);
    commitRows(h.db, { accountId: main, rows, setOpeningBalance: null });
    expect(commitRows(h.db, { accountId: main, rows, setOpeningBalance: null })).toMatchObject({ ok: true, imported: 0 });
    expect(txs()).toHaveLength(7);
  });

  it("an overlapping statement imports only the new lines", async () => {
    commitRows(h.db, { accountId: main, rows: accept(await preview()), setOpeningBalance: null });
    const overlap = `
BEGINNING BALANCE 983.60
10/09/26 ATM WITHDRAWAL KLCC 300.00- 683.60
12/09/26 DUITNOW QR MAKAN ENAK 18.00- 665.60
14/09/26 STARBUCKS COFFEE 14.50- 651.10
`.trim();
    const p = await preview({ text: overlap });
    expect(p.rows.map((r) => r.proposal.kind)).toEqual(["skip", "skip", "expense"]);
  });

  it("the savings statement's matching credit is recognised as the transfer already recorded", async () => {
    const first = await preview();
    commitRows(h.db, { accountId: main, rows: accept(first, (r) => (r.description.startsWith("TRANSFER TO A/C") ? { kind: "transfer", transferAccountId: savings, categoryId: null } : {})), setOpeningBalance: null });
    const savingsStatement = "BEGINNING BALANCE 20,000.00\n28/08/26 TRANSFER FROM A/C 4,200.00+ 24,200.00\n05/09/26 INTEREST CREDIT 12.40+ 24,212.40";
    const p = await preview({ accountId: savings, text: savingsStatement });
    expect(p.rows.map((r) => [r.description, r.proposal.kind])).toEqual([["TRANSFER FROM A/C", "skip"], ["INTEREST CREDIT", "income"]]);
  });

  it("the SECOND account of a pair can still get its starting balance after the first import mirrored a transfer onto it", async () => {
    const first = await preview();
    commitRows(h.db, { accountId: main, rows: accept(first, (r) => (r.description.startsWith("TRANSFER TO A/C") ? { kind: "transfer", transferAccountId: savings, categoryId: null } : {})), setOpeningBalance: null });
    const savingsStatement = "BEGINNING BALANCE 20,000.00\n28/08/26 TRANSFER FROM A/C 4,200.00+ 24,200.00\n05/09/26 INTEREST CREDIT 12.40+ 24,212.40";
    const p = await preview({ accountId: savings, text: savingsStatement });
    // the mirrored transfer is dated on the statement's first day, not before it, so it doesn't count as "already in progress"
    expect(p.account.existingEntries).toBe(0);
    const res = commitRows(h.db, { accountId: savings, rows: accept(p), setOpeningBalance: p.openingBalance });
    expect(res).toMatchObject({ ok: true, imported: 1, openingSet: true });
    expect(h.db.select().from(accounts).where(eq(accounts.id, savings)).get()!.openingBalance).toBe(RM(20_000));
  });

  it("but an entry dated BEFORE the statement starts still blocks it (the balance is already in progress)", async () => {
    h.db.insert(transactions).values({ date: "2026-08-01", type: "expense", amount: 100, accountId: savings, categoryId: cat("Groceries") }).run();
    const p = await preview({ accountId: savings, text: "BEGINNING BALANCE 20,000.00\n05/09/26 INTEREST CREDIT 12.40+ 20,012.40" });
    expect(p.account.existingEntries).toBe(1);
  });

  it("a transfer rule learned on the MAIN statement is not applied to the SAVINGS statement (it would point at itself)", async () => {
    const first = await preview();
    commitRows(h.db, {
      accountId: main,
      rows: accept(first, (r) => (r.description.startsWith("TRANSFER TO A/C") ? { kind: "transfer", transferAccountId: savings, categoryId: null, remember: true } : {})),
      setOpeningBalance: null,
    });
    const p = await preview({ accountId: savings, text: "BEGINNING BALANCE 5,000.00\n20/10/26 TRANSFER TO A/C 1,000.00- 4,000.00" });
    expect(p.rows[0].proposal.source).not.toBe("rule");
  });
});

describe("commit refuses bad input and writes NOTHING", () => {
  const base = (): CommitRow => ({ key: "k1", date: "2026-09-01", amount: -RM(10), description: "X", kind: "expense", categoryId: cat("Groceries"), item: "X", billId: null, transferAccountId: null, remember: false });
  it.each([
    ["an expense with no category", { categoryId: null }, /choose a category/],
    ["an expense in an income category", { categoryId: undefined as unknown as number, kind: "expense" as const }, /category/],
    ["a transfer to the same account", { kind: "transfer" as const, categoryId: null, transferAccountId: -1 }, /OTHER account/],
    ["a transfer with no other account", { kind: "transfer" as const, categoryId: null, transferAccountId: null }, /OTHER account/],
    ["a bill that doesn't exist", { billId: 9999 }, /no longer exists/],
    ["a malformed date", { date: "01/09/2026" }, /date/],
    ["a zero amount", { amount: 0 }, /amount/],
  ])("%s", (_label, over, message) => {
    const row = { ...base(), ...over };
    if (row.transferAccountId === -1) row.transferAccountId = main;
    if ((over as { categoryId?: number }).categoryId === undefined && "categoryId" in over) row.categoryId = cat("Salary");
    const good = { ...base(), key: "k0" };
    const res = commitRows(h.db, { accountId: main, rows: [good, row], setOpeningBalance: null });
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(message);
    expect(txs()).toHaveLength(0); // the good row was NOT saved either
  });

  it("won't import into an investment account or a missing one", () => {
    const inv = h.db.insert(accounts).values({ name: "FD", type: "investment" }).returning().get();
    expect(commitRows(h.db, { accountId: inv.id, rows: [base()], setOpeningBalance: null }).ok).toBe(false);
    expect(commitRows(h.db, { accountId: 9999, rows: [base()], setOpeningBalance: null }).ok).toBe(false);
  });

  it("never changes an opening balance on an account that already has entries", () => {
    h.db.insert(transactions).values({ date: "2026-08-01", type: "expense", amount: 100, accountId: main, categoryId: cat("Groceries") }).run();
    h.db.update(accounts).set({ openingBalance: RM(500) }).where(eq(accounts.id, main)).run();
    const res = commitRows(h.db, { accountId: main, rows: [base()], setOpeningBalance: RM(1200) });
    expect(res).toMatchObject({ ok: true, openingSet: false });
    expect(h.db.select().from(accounts).where(eq(accounts.id, main)).get()!.openingBalance).toBe(RM(500));
  });
});

describe("a shared bill's payments through the whole import", () => {
  const NETFLIX_SHARE = "01/09/26 DUITNOW TO ACCOUNT 5 JANE A/L DOE 133.50+ 1,333.50";
  const setUp = () => {
    const bill = h.db.select().from(recurringBills).all().find((b) => b.name === "Netflix")!;
    return h.db.insert(billShares).values({ billId: bill.id, name: "Jane", share: RM(22.25), startMonth: "2026-01", matchKeywords: "jane" }).returning().get().id;
  };

  it("is recognised, saved as Reimbursements, and counted towards that person", async () => {
    const shareId = setUp();
    const p = await preview({ text: `BEGINNING BALANCE 1,200.00\n${NETFLIX_SHARE}` });
    expect(p.rows[0].proposal).toMatchObject({ source: "share", shareId, item: "Netflix share", categoryId: cat("Reimbursements") });
    commitRows(h.db, { accountId: main, rows: accept(p, (r) => ({ shareId: r.proposal.shareId })), setOpeningBalance: null });
    expect(txs()[0]).toMatchObject({ type: "income", amount: RM(133.5), shareId, categoryId: cat("Reimbursements"), item: "Netflix share" });
  });

  it("only money in carries a share: it is dropped from anything else", async () => {
    const shareId = setUp();
    const p = await preview({ text: `BEGINNING BALANCE 1,200.00\n${NETFLIX_SHARE}` });
    commitRows(h.db, { accountId: main, rows: accept(p, () => ({ kind: "expense", categoryId: cat("Groceries"), shareId })), setOpeningBalance: null });
    expect(txs()[0]).toMatchObject({ type: "expense", shareId: null });
  });

  it("refuses a person who no longer exists, and saves nothing", async () => {
    const p = await preview({ text: `BEGINNING BALANCE 1,200.00\n${NETFLIX_SHARE}` });
    const res = commitRows(h.db, { accountId: main, rows: accept(p, () => ({ shareId: 9999 })), setOpeningBalance: null });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/no longer on a shared bill/) });
    expect(txs()).toHaveLength(0);
  });
});

describe("transfers that appear on only ONE side (money that went to an account you don't track)", () => {
  const toSavings = (r: PreviewOk["rows"][number]) => (r.description.startsWith("TRANSFER TO A/C") ? { kind: "transfer" as const, transferAccountId: savings, categoryId: null } : {});
  const importMain = async () => commitRows(h.db, { accountId: main, rows: accept(await preview(), toSavings), setOpeningBalance: null });
  // a savings statement covering the same dates
  const savingsText = (withCredit: boolean) =>
    ["BEGINNING BALANCE 20,000.00", "28/08/26 SOME DEPOSIT 100.00+ 20,100.00", ...(withCredit ? ["28/08/26 TRANSFER FROM A/C 4,200.00+ 24,300.00"] : []), "05/09/26 INTEREST CREDIT 12.40+ 24,312.40"].join("\n");

  it("flags a transfer recorded from the other statement that this statement doesn't show", async () => {
    await importMain();
    const p = await preview({ accountId: savings, text: savingsText(false) });
    expect(p.oneSided).toEqual([expect.objectContaining({ date: "2026-08-28", amount: RM(4200), where: "other", note: expect.stringMatching(/TRANSFER TO A\/C/) })]);
  });

  it("flags a transfer in THIS statement when the other account is already imported for those dates but has no matching line", async () => {
    h.db.insert(importRules).values({ pattern: "mr tan", kind: "transfer", transferAccountId: savings }).run();
    const s = await preview({ accountId: savings, text: savingsText(false) });
    commitRows(h.db, { accountId: savings, rows: accept(s), setOpeningBalance: null });
    const p = await preview();
    expect(p.oneSided).toEqual([expect.objectContaining({ date: "2026-08-28", amount: -RM(4200), where: "here" })]);
  });

  it("says nothing when every transfer is on both sides", async () => {
    await importMain();
    expect((await preview({ accountId: savings, text: savingsText(true) })).oneSided).toEqual([]);
  });

  it("says nothing while the other account simply hasn't been imported yet", async () => {
    h.db.insert(importRules).values({ pattern: "mr tan", kind: "transfer", transferAccountId: savings }).run();
    expect((await preview()).oneSided).toEqual([]);
  });

  it("never counts a cash withdrawal: cash has no statement to appear on", async () => {
    const p = await preview();
    expect(p.rows.find((r) => r.description.includes("ATM"))!.proposal).toMatchObject({ kind: "transfer", transferAccountId: cash });
    expect(p.oneSided).toEqual([]);
  });
});

describe("transfers near the edge of a month the other account hasn't imported yet", () => {
  // The transfer is on 28 Aug (MAIN_STATEMENT). The other account's activity must be on BOTH sides of it, within 3 days.
  const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });
  async function withSavingsDays(...days: string[]) {
    h.db.insert(importRules).values({ pattern: "mr tan", kind: "transfer", transferAccountId: savings }).run();
    const text = ["BEGINNING BALANCE 20,000.00", ...days.map((d, i) => `${d}/08/26 SOME DEPOSIT 100.00+ ${money(20_100 + i * 100)}`)].join("\n");
    commitRows(h.db, { accountId: savings, rows: accept(await preview({ accountId: savings, text })), setOpeningBalance: null });
    return preview();
  }

  it("is not judged when the other account only has activity AFTER it (the other statement hasn't reached this far back)", async () => {
    expect((await withSavingsDays("31")).oneSided).toEqual([]);
  });
  it("is not judged when the other account only has activity BEFORE it (its next stretch isn't imported yet)", async () => {
    expect((await withSavingsDays("25")).oneSided).toEqual([]);
  });
  it("is judged once the other account has activity on both sides, and flagged when it has no matching line", async () => {
    expect((await withSavingsDays("25", "31")).oneSided).toEqual([expect.objectContaining({ date: "2026-08-28", amount: -RM(4200), where: "here" })]);
  });
});

describe("payees you have already filed the same way, learned from what you imported", () => {
  const QR = (day: string, amount: number, bal: number, name = "PAK ALI ENTERPRISE") =>
    `${day}/09/26 IBK FUND TFR FR A/C ${name} * QR711880${day} DUITNOW QR ${amount.toFixed(2)}- ${bal.toFixed(2)}`;
  const import1 = async (lines: string[], opening: number, edit?: (r: PreviewOk["rows"][number], i: number) => Partial<CommitRow>) => {
    const p = await preview({ text: [`BEGINNING BALANCE ${opening.toFixed(2)}`, ...lines].join("\n") });
    commitRows(h.db, { accountId: main, rows: accept(p, (r) => edit?.(r, p.rows.indexOf(r)) ?? {}), setOpeningBalance: null });
  };
  const learned = async () => (await import("@/lib/import/history")).learnFromHistory(h.db);

  it("learns a payee after two entries filed the same way, and uses it for the next one (at any amount)", async () => {
    await import1([QR("01", 12, 988), QR("02", 9, 979)], 1000);
    expect(await learned()).toEqual([expect.objectContaining({ kind: "expense", categoryId: cat("Eating Out"), item: "Pak Ali Enterprise", count: 2 })]);
    // RM 60 is above the small-QR guess, which would have said Miscellaneous
    const p = await preview({ text: ["BEGINNING BALANCE 979.00", QR("05", 60, 919)].join("\n") });
    expect(p.rows[0].proposal).toMatchObject({ source: "history", confidence: "high", categoryId: cat("Eating Out"), reason: expect.stringMatching(/Eating Out 2 times/) });
    expect(p.stats.needsReview).toBe(0);
  });

  it("learns nothing from a single entry, or from a payee you have filed two different ways", async () => {
    await import1([QR("01", 12, 988)], 1000);
    expect(await learned()).toEqual([]);
    await import1([QR("02", 9, 979)], 988, () => ({ categoryId: cat("Shopping") }));
    expect(await learned()).toEqual([]);
  });

  it("ignores hand-typed entries, bills and transfers", async () => {
    h.db.insert(transactions).values([1, 2, 3].map((i) => ({ date: `2026-09-0${i}`, type: "expense" as const, amount: RM(10), accountId: main, categoryId: cat("Eating Out"), note: "PAK ALI ENTERPRISE" }))).run();
    expect(await learned()).toEqual([]); // no import fingerprint: free text
    await import1(["08/09/26 NETFLIX.COM 88.90- 911.10", "08/10/26 NETFLIX.COM 88.90- 822.20"], 1000);
    expect(await learned()).toEqual([]); // linked to the Netflix bill, which has its own step
  });

  it("REGRESSION: never learns your own name, so a transfer between your accounts is not filed as spending", async () => {
    // Two "top-ups to yourself" filed as expenses must not teach "JANE A/L DOE = expense": the same text, with the
    // transfer rule pointing back at THIS account (skipped), used to fall through to history and be saved as spending.
    const own = (d: string, n: number, bal: number) => `${d}/09/26 IBK FUND TFR FR A/C JANE A/L DOE * Top up MBB CT ${n.toFixed(2)}- ${bal.toFixed(2)}`;
    await import1([own("01", 20, 980), own("02", 20, 960)], 1000);
    expect(await learned()).toHaveLength(1); // as an ordinary payee it IS learned...
    h.db.insert(transactions).values({ date: "2026-09-03", type: "transfer", amount: RM(100), accountId: savings, toAccountId: main, note: "IBK FUND TFR TO A/C JANE A/L DOE * Savings MBB CT-", importKey: "x|1" }).run();
    expect(await learned()).toEqual([]); // ...but not once the same name has been used for a transfer
    // and even if it were learned, a transfer rule that knows the name wins over history
    h.db.insert(importRules).values({ pattern: "jane a l doe", kind: "transfer", transferAccountId: main }).run(); // points back at the statement's own account
    const p = await buildPreview(h.db, { accountId: main, text: ["BEGINNING BALANCE 960.00", "05/09/26 DUITNOW TO ACCOUNT 1234 JANE A/L DOE Savings 6000.00- 0.00"].join("\n"), expectedIncome: RM(5400), });
    expect(p.ok && p.rows[0].proposal.source).not.toBe("history");
  });

  it("lets a rule you taught it, or a bill, win over history", async () => {
    await import1([QR("01", 12, 988), QR("02", 9, 979)], 1000);
    h.db.insert(importRules).values({ pattern: "pak ali enterprise", kind: "expense", categoryId: cat("Shopping"), item: "Pak Ali" }).run();
    const p = await preview({ text: ["BEGINNING BALANCE 979.00", QR("05", 60, 919)].join("\n") });
    expect(p.rows[0].proposal).toMatchObject({ source: "rule", categoryId: cat("Shopping") });
  });
});

describe("a statement uploaded for the wrong account", () => {
  // Both accounts have a month of history; the next month's statements follow.
  const SAVINGS_SEPT = ["BEGINNING BALANCE 20,000.00", "28/08/26 SOME DEPOSIT 100.00+ 20,100.00", "28/08/26 TRANSFER FROM A/C 4,200.00+ 24,300.00", "05/09/26 INTEREST CREDIT 12.40+ 24,312.40"].join("\n");
  const SAVINGS_OCT = "BEGINNING BALANCE 24,312.40\n03/10/26 INTEREST CREDIT 10.00+ 24,322.40";
  const MAIN_OCT = "BEGINNING BALANCE 965.60\n05/10/26 PETRONAS DAGANGAN 40.00- 925.60";

  async function bothImported() {
    const toSavings = (r: PreviewOk["rows"][number]) => (r.description.startsWith("TRANSFER TO A/C") ? { kind: "transfer" as const, transferAccountId: savings, categoryId: null } : {});
    commitRows(h.db, { accountId: main, rows: accept(await preview(), toSavings), setOpeningBalance: RM(1200) });
    commitRows(h.db, { accountId: savings, rows: accept(await preview({ accountId: savings, text: SAVINGS_SEPT })), setOpeningBalance: RM(20000) });
  }

  it("says so, and names the account whose books match the statement exactly", async () => {
    await bothImported();
    const p = await preview({ accountId: main, text: SAVINGS_OCT });
    expect(p.accountCheck).toEqual({ date: "2026-10-03", statement: RM(24312.4), books: RM(965.6), looksLike: { id: savings, name: "Savings" } });
  });

  it("says nothing when the statement belongs to the account it was uploaded for", async () => {
    await bothImported();
    expect((await preview({ accountId: savings, text: SAVINGS_OCT })).accountCheck).toBeNull();
    expect((await preview({ accountId: main, text: MAIN_OCT })).accountCheck).toBeNull();
  });

  it("still flags a statement that matches no account's books, without accusing another account", async () => {
    await bothImported();
    const p = await preview({ accountId: savings, text: "BEGINNING BALANCE 24,000.00\n03/10/26 INTEREST CREDIT 10.00+ 24,010.00" });
    expect(p.accountCheck).toEqual({ date: "2026-10-03", statement: RM(24000), books: RM(24312.4), looksLike: null });
  });

  it("stays quiet for an account with no history yet (the first statement sets the starting balance)", async () => {
    expect((await preview({ accountId: main, text: SAVINGS_OCT })).accountCheck).toBeNull();
  });

  it("is judged from the balance just before the first line kept when a start date is chosen", async () => {
    await bothImported();
    const text = ["BEGINNING BALANCE 24,000.00", "01/10/26 SOME DEPOSIT 312.40+ 24,312.40", "03/10/26 INTEREST CREDIT 10.00+ 24,322.40"].join("\n");
    expect((await preview({ accountId: savings, text, startDate: "2026-10-03" })).accountCheck).toBeNull();
    expect((await preview({ accountId: main, text, startDate: "2026-10-03" })).accountCheck).toMatchObject({ looksLike: { name: "Savings" } });
  });
});

describe("a statement for an account that barely moves (dates without a year, a month with one transaction or none)", () => {
  // Invented figures in the layout of a Maybank MAE statement: the column headings, the opening balance and the whole
  // table share one block of text, and the dates read "31/07", with the year only in the statement date.
  const w = (text: string, x: number, y: number) => ({ text, x, y });
  const page = (body: ReturnType<typeof w>[]) =>
    makePdf([[
      w("STATEMENT DATE : 31/07/26", 300, 740),
      w("URUSNIAGA AKAUN / ACCOUNT TRANSACTIONS", 150, 712),
      w("ENTRY DATE", 30, 700), w("VALUE DATE", 79, 700), w("TRANSACTION DESCRIPTION", 185, 700), w("TRANSACTION AMOUNT", 331, 700), w("STATEMENT BALANCE", 417, 700),
      ...body,
    ]]);
  const ONE = page([
    w("BEGINNING BALANCE", 126, 688), w("4,000.00", 440, 688),
    w("31/07", 43, 676), w("TRANSFER FR A/C", 126, 676), w("250.00-", 361, 676), w("3,750.00", 440, 676),
    w("JANE A/L DOE *", 134, 664), w("Savings", 134, 652),
    w("ENDING BALANCE :", 126, 600), w("3,750.00", 440, 600),
    w("TOTAL DEBIT :", 126, 588), w("250.00", 451, 588),
  ]);
  const NONE = page([
    w("BEGINNING BALANCE", 126, 688), w("4,000.00", 440, 688),
    w("ENDING BALANCE :", 126, 600), w("4,000.00", 440, 600),
    w("TOTAL DEBIT :", 126, 588), w(".00", 459, 588),
    w("TOTAL CREDIT :", 126, 576), w(".00", 459, 576),
  ]);

  it("REGRESSION: the single transaction is read as it stands, not replaced by the page's headings", async () => {
    // The row-by-row reader for web-page print-outs used to take over, because the headings sit "above the date line".
    const r = await buildPreview(h.db, { accountId: main, bytes: ONE, expectedIncome: RM(5400) });
    if (!r.ok) throw new Error(r.error);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ date: "2026-07-31", amount: -RM(250), balance: RM(3750) });
    expect(r.rows[0].description).toBe("TRANSFER FR A/C JANE A/L DOE * Savings");
    expect(r.check).toMatchObject({ matched: 1, mismatches: [], openingVerified: true });
    expect(r.openingBalance).toBe(RM(4000));
  });

  it("says plainly when a month has no transactions at all, and what the balance was", async () => {
    const r = await buildPreview(h.db, { accountId: main, bytes: NONE, expectedIncome: RM(5400) });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/no transactions.*RM\s4,000\.00.*nothing to import/) });
  });
});

describe("a bank web page printed to PDF, through the whole import", () => {
  it("is read by table row: every transaction keeps its own description, and the balance chain holds", async () => {
    const r = await buildPreview(h.db, { accountId: main, bytes: printoutPdf(), expectedIncome: RM(5400) });
    if (!r.ok) throw new Error(r.error);
    expect(r.mode).toBe("pdf");
    expect(r.rows.map((x) => [x.date, x.amount])).toEqual([["2026-02-28", RM(22.25)], ["2026-03-01", -RM(4.95)], ["2026-03-02", -RM(10)], ["2026-03-03", -RM(25)]]);
    expect(r.rows[3].description).toMatch(/POS DEBIT.*CAFE ABC KL/);
    expect(r.rows[2].description).not.toMatch(/CAFE/);
    expect(r.check).toMatchObject({ matched: 3, mismatches: [], firstRowGuessed: false });
    expect(r.warnings).toEqual([]);
  });

  it("REGRESSION: a friend's payment on the oldest line is income, not a purchase linked to the Netflix bill", async () => {
    // "JANE ... Netflix jul": nothing says it is a credit, and the page has no balance before it. It used to be guessed as
    // money OUT, matched to the Netflix bill by the word "Netflix", and saved as an expense (its true effect is the opposite).
    const r = await buildPreview(h.db, { accountId: main, bytes: printoutPdf(), expectedIncome: RM(5400) });
    if (!r.ok) throw new Error(r.error);
    expect(r.rows[0]).toMatchObject({ amount: RM(22.25), signedBy: "hint" });
    expect(r.rows[0].proposal).toMatchObject({ kind: "income", billId: null });
    expect(r.openingBalance).toBe(RM(992.7));
  });

  it("without the column headings it can only guess, and it still says so", async () => {
    const r = await buildPreview(h.db, { accountId: main, bytes: printoutPdf(false), expectedIncome: RM(5400) });
    if (!r.ok) throw new Error(r.error);
    expect(r.check.firstRowGuessed).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/first row is a guess/);
    expect(r.rows[0].signedBy).toBe("guess");
  });
});

describe("other input types and failures", () => {
  it("reads a real PDF the same way", async () => {
    const pdf = makePdf([
      tablePage(
        [
          ["ENTRY DATE", "TRANSACTION DESCRIPTION", "TRANSACTION AMOUNT", "STATEMENT BALANCE"],
          ["", "BEGINNING BALANCE", "", "1,200.00"],
          ["01/09/26", "PETRONAS DAGANGAN", "62.50-", "1,137.50"],
          ["02/09/26", "NETFLIX.COM", "88.90-", "1,048.60"],
        ],
        [20, 90, 380, 470],
      ),
    ]);
    const p = await preview({ text: undefined, bytes: pdf });
    expect(p.mode).toBe("pdf");
    expect(p.rows.map((r) => [r.proposal.item, r.amount])).toEqual([["Petrol", -RM(62.5)], ["Netflix", -RM(88.9)]]);
    expect(p.check.openingVerified).toBe(true);
  });

  it("reads a CSV, and reports the column layout so a wrong guess can be corrected", async () => {
    const csv = "Date,Description,Debit,Credit,Balance\n01/09/26,PETRONAS,62.50,,1137.50\n02/09/26,SALARY ACME,,5400.00,6537.50";
    const p = await preview({ text: csv });
    expect(p.mode).toBe("csv");
    expect(p.csv!.layout).toMatchObject({ date: 0, debit: 2, credit: 3, balance: 4 });
    expect(p.rows.map((r) => r.amount)).toEqual([-RM(62.5), RM(5400)]);
  });

  it("explains an unreadable PDF and an empty submission; asks for column choices when there is no header", async () => {
    expect(await buildPreview(h.db, { accountId: main, bytes: new TextEncoder().encode("%PDF-1.4 junk"), expectedIncome: 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/couldn't be read/) });
    expect(await buildPreview(h.db, { accountId: main, text: "   ", expectedIncome: 0 })).toMatchObject({ ok: false });
    const noHeader = await buildPreview(h.db, { accountId: main, bytes: new TextEncoder().encode("01/09/26,COFFEE,10.00\n02/09/26,TEA,5.00"), expectedIncome: 0 });
    expect(noHeader).toMatchObject({ ok: false, mapping: { sample: expect.any(Array) } });
  });

  it("applies a manual column choice", async () => {
    const p = await preview({ text: "01/09/26,COFFEE,10.00\n02/09/26,TEA,5.00", overrides: { headerRow: -1, date: 0, description: [1], amount: 2 } });
    expect(p.rows.map((r) => r.description)).toEqual(["COFFEE", "TEA"]);
  });

  it("refuses a missing or investment account", async () => {
    expect(await buildPreview(h.db, { accountId: 9999, text: MAIN_STATEMENT, expectedIncome: 0 })).toMatchObject({ ok: false });
    const inv = h.db.insert(accounts).values({ name: "FD", type: "investment" }).returning().get();
    expect(await buildPreview(h.db, { accountId: inv.id, text: MAIN_STATEMENT, expectedIncome: 0 })).toMatchObject({ ok: false });
  });
});
