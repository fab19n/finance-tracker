import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, categories, transactions } from "@/db/schema";
import type { CommitRow, PreviewOk } from "@/lib/import/api-types";
import { booksBalanceBefore } from "@/lib/import/books";
import { commitRows } from "@/lib/import/commit";
import { extractPdfPages } from "@/lib/import/pdf-extract";
import { buildPreview } from "@/lib/import/preview";
import { looksLikeTngWallet, parseTngWallet } from "@/lib/import/tng";
import { makePdf, tablePage, tngPdf } from "./pdf-fixture";

// A Touch 'n Go eWallet history: a table turned on its side (one COLUMN per transaction), with the wallet's table and
// GO+'s. Invented numbers: the combined account goes 5.02 -> 15.03 (see tngPdf).

const RM = (n: number) => Math.round(n * 100);
const read = async (bytes: Uint8Array) => parseTngWallet(await extractPdfPages(bytes));

describe("reading the sideways table", () => {
  it("is recognised by its heading, and an ordinary statement is not", async () => {
    expect(looksLikeTngWallet(await extractPdfPages(tngPdf()))).toBe(true);
    const bank = makePdf([tablePage([["01/03/26", "COFFEE SHOP", "5.00-", "95.00"]], [30, 100, 300, 400])]);
    expect(looksLikeTngWallet(await extractPdfPages(bank))).toBe(false);
  });

  it("keeps only the money that really enters or leaves, in date order, with the right sign", async () => {
    const t = (await read(tngPdf()))!;
    expect(t.rows.map((r) => [r.date, r.amount, r.description])).toEqual([
      ["2026-03-02", RM(30), "DUITNOW TRANSFER FROM JANE A/L DOE"],
      ["2026-03-02", -RM(10), "Touch 'n Go card reload"],
      ["2026-03-05", -RM(4), "Parking"],
      ["2026-03-09", -RM(6), "Sent to JOHN TAN"],
      ["2026-03-10", RM(0.01), "GO+ interest 2 Mar 2026 to 10 Mar 2026"],
    ]);
    // wallet <-> GO+ moves ("Cash Out", "Reload via GO+ Balance", "GO+ Cash In") and the reversed RM 6 payment with the
    // credit that cancelled it are not lines at all
    expect(t.rows.every((r) => r.signedBy === "hint")).toBe(true);
  });

  it("works out where the combined account started and ended, and the lines take it from one to the other, to the sen", async () => {
    const t = (await read(tngPdf()))!;
    expect(t.openingBalance).toBe(RM(5.02)); // wallet 5.00 + GO+ 0.02
    expect(t.closingBalance).toBe(RM(15.03)); // wallet 0.00 + GO+ 15.03
    expect(t.rows.map((r) => r.balance)).toEqual([RM(35.02), RM(25.02), RM(21.02), RM(15.02), RM(15.03)]);
    expect(t.check).toMatchObject({ openingVerified: true, firstRowGuessed: false, total: { opening: RM(5.02), closing: RM(15.03), ok: true } });
    expect(t.warnings).toEqual([]);
  });

  it("turns a fraction of a sen a day into ONE interest line, whatever the bank's rounding", async () => {
    // three days at RM 0.0040 = 1.2 sen; the balances moved by exactly 1 sen
    expect((await read(tngPdf()))!.rows.filter((r) => /interest/.test(r.description)).map((r) => r.amount)).toEqual([1]);
  });

  it("says so when the lines do not reach the statement's closing balance", async () => {
    const t = (await read(tngPdf({ goClosing: "RM15.40" })))!;
    expect(t.check.total).toMatchObject({ opening: RM(5.02), closing: RM(15.40), ok: false });
    expect(t.check.openingVerified).toBe(false);
    expect(t.warnings.join(" ")).toMatch(/take the wallet from[\s\S]*5\.02[\s\S]*15\.0[\s\S]*ends at[\s\S]*15\.40/);
  });

  it("leaves out a kind of line it does not know, and warns (the check fails, so nothing slips through)", async () => {
    const t = (await read(tngPdf({ extraWallet: [{ date: "10/3/2026", type: ["Mystery Fee"], desc: ["??"], amount: "RM1.00", balance: "RM0.00" }] })))!;
    expect(t.rows.some((r) => /Mystery/.test(r.description))).toBe(false);
    expect(t.warnings.join(" ")).toMatch(/don't recognise: Mystery Fee \(1\)/);
  });

  it("keeps a cancellation as a refund when the payment it cancelled is not in the same statement", async () => {
    const t = (await read(tngPdf({ skipReversed: true })))!;
    expect(t.rows.find((r) => /refund/.test(r.description))).toMatchObject({ amount: RM(6), description: "Card Reload (refund)" });
  });
});

// ------------------------------------------------------------------------------------------------ through the importer
const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));

let main: number, wallet: number;
const cat = (name: string) => h.db.select().from(categories).where(eq(categories.name, name)).get()!.id;

beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  const all = h.db.select().from(accounts).all();
  main = all.find((a) => a.type === "bank")!.id;
  wallet = all.find((a) => a.type === "ewallet")!.id;
});

const preview = async (over: Partial<Parameters<typeof buildPreview>[1]> = {}): Promise<PreviewOk> => {
  const r = await buildPreview(h.db, { accountId: wallet, bytes: tngPdf(), expectedIncome: RM(5400), ...over });
  if (!r.ok) throw new Error(`preview failed: ${r.error}`);
  return r;
};
const accept = (p: PreviewOk): CommitRow[] =>
  p.rows.map((r) => ({ key: r.key, date: r.date, amount: r.amount, description: r.description, kind: r.proposal.kind, categoryId: r.proposal.categoryId, item: r.proposal.item, billId: r.proposal.billId, transferAccountId: r.proposal.transferAccountId, remember: false }));

/** The top-up as the BANK's statement recorded it: Maybank-style, from the account the money left. */
const bankSide = () =>
  h.db.insert(transactions).values({ date: "2026-03-02", type: "transfer", amount: RM(30), accountId: main, toAccountId: wallet, item: "Transfer", note: "IBK FUND TFR FR A/C JANE A/L DOE * Topup MBB CT", importKey: "bank|1" }).run();

describe("through the importer", () => {
  it("checks the statement as a whole, and offers its opening balance for an account with no history", async () => {
    const p = await preview();
    expect(p.mode).toBe("pdf");
    expect(p.check.total).toEqual({ opening: RM(5.02), closing: RM(15.03), ok: true });
    expect(p.openingBalance).toBe(RM(5.02));
    expect(p.account).toMatchObject({ id: wallet, existingEntries: 0 });
    expect(p.dateRange).toEqual({ from: "2026-03-02", to: "2026-03-10" });
  });

  it("recognises the top-up the bank's statement already recorded, so it is not counted twice", async () => {
    bankSide();
    const p = await preview();
    expect(p.rows[0].proposal).toMatchObject({ kind: "skip", source: "duplicate", reason: expect.stringMatching(/already recorded/) });
    expect(p.stats).toMatchObject({ duplicates: 1, fresh: 4 });
    expect(p.oneSided).toEqual([]); // every top-up the bank recorded shows up on this statement too
  });

  it("says when the bank recorded a top-up that the wallet's statement does not show", async () => {
    bankSide();
    h.db.insert(transactions).values({ date: "2026-03-04", type: "transfer", amount: RM(20), accountId: main, toAccountId: wallet, note: "IBK FUND TFR FR A/C JANE A/L DOE * Topup MBB CT", importKey: "bank|2" }).run();
    const p = await preview();
    expect(p.oneSided).toEqual([expect.objectContaining({ date: "2026-03-04", amount: RM(20), where: "other" })]);
  });

  it("files card reloads and parking as transport, the interest as investment income, and asks only about what it can't know", async () => {
    bankSide();
    const p = await preview();
    const by = (s: string) => p.rows.find((r) => r.description.includes(s))!.proposal;
    expect(by("card reload")).toMatchObject({ kind: "expense", categoryId: cat("Transport & Fuel"), item: "Touch 'n Go reload", source: "builtin", confidence: "high" });
    expect(by("Parking")).toMatchObject({ kind: "expense", categoryId: cat("Transport & Fuel"), item: "Parking", source: "builtin" });
    expect(by("GO+ interest")).toMatchObject({ kind: "income", categoryId: cat("Investment Income"), source: "builtin" });
    expect(by("Sent to JOHN TAN")).toMatchObject({ kind: "expense", source: "default", confidence: "low" }); // a person: could be anything
    expect(p.stats.needsReview).toBe(1);
  });

  it("lands on the statement's closing balance once imported, and importing it again adds nothing", async () => {
    bankSide();
    const p = await preview();
    const res = commitRows(h.db, { accountId: wallet, rows: accept(p), setOpeningBalance: p.openingBalance });
    expect(res).toMatchObject({ ok: true, imported: 4, skipped: 1, openingSet: true });
    // opening 5.02 + 30.00 recorded from the bank's side + the four new lines (-10.00 -4.00 -6.00 +0.01) = 15.03
    expect(booksBalanceBefore(h.db, wallet, "2100-01-01")).toBe(RM(15.03));
    const again = await preview();
    expect(again.stats).toMatchObject({ fresh: 0, duplicates: 5 });
  });

  it("warns when a wallet history is aimed at a bank account, and names the wallet as the likely owner", async () => {
    // The wallet starts the statement on exactly its opening balance; the bank account already has history.
    h.db.update(accounts).set({ openingBalance: RM(5.02) }).where(eq(accounts.id, wallet)).run();
    h.db.insert(transactions).values({ date: "2026-02-20", type: "expense", amount: RM(12), accountId: main, note: "SOMETHING", importKey: "old|1" }).run();
    const p = await preview({ accountId: main });
    expect(p.warnings[0]).toMatch(/Touch 'n Go wallet history.*is a bank account.*Choose your e-Wallet account/);
    expect(p.accountCheck).toMatchObject({ statement: RM(5.02), looksLike: { id: wallet } });
  });

  it("warns, and checks nothing off, when a statement's lines don't add up", async () => {
    const p = await preview({ bytes: tngPdf({ goClosing: "RM15.40" }) });
    expect(p.check.total).toMatchObject({ ok: false });
    expect(p.warnings.join(" ")).toMatch(/ends at/);
  });
});
