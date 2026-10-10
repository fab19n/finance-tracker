import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, categories, importRules, recurringBills, transactions } from "@/db/schema";
import type { CommitRow, PreviewOk, PreviewResult } from "@/lib/import/api-types";
import { commitRows } from "@/lib/import/commit";
import { buildPreview } from "@/lib/import/preview";
import { makePdf, tablePage } from "./pdf-fixture";

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
