import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, categories, recurringBills, transactions } from "@/db/schema";
import { BULK_MAX, bulkDeleteSheet, categorySetMessage, cleanIds, isLinked, planDelete, planSetCategory, summarize, type BulkRow } from "@/lib/entry-bulk";
import { decodeUndo, encodeUndo, takeDeleted, withDeleted, type RestorableRow } from "@/lib/entry-delete";
import { safeBackPath, withBack, withFragment } from "@/lib/back";
import { sortHeader } from "@/components/activity/table-logic";
import { categoryHint, categoryKind, uniqueTicked } from "@/components/activity/bulk-logic";
import { takeUndo, UNDO_KEY } from "@/components/activity/undo-store";

const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
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

let ids: { bank: number; cash: number; food: number; salary: number; transport: number };
beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  const a = h.db.select().from(accounts).all();
  const c = h.db.select().from(categories).all();
  ids = {
    bank: a.find((x) => x.type === "bank")!.id,
    cash: a.find((x) => x.type === "cash")!.id,
    food: c.find((x) => x.name === "Eating Out")!.id,
    salary: c.find((x) => x.name === "Salary")!.id,
    transport: c.find((x) => x.type === "expense" && x.name !== "Eating Out")!.id,
  };
});

type Over = Partial<typeof transactions.$inferInsert>;
function add(over: Over = {}) {
  return h.db
    .insert(transactions)
    .values({ date: "2026-10-09", type: "expense", amount: 500, accountId: ids.bank, categoryId: ids.food, item: "teh tarik", ...over })
    .returning()
    .get();
}
const all = () => h.db.select().from(transactions).all();

describe("safeBackPath fragments", () => {
  it("keeps a plain #fragment and drops an unsafe one", () => {
    expect(safeBackPath("/transactions?month=2026-10#tx-123")).toBe("/transactions?month=2026-10#tx-123");
    expect(safeBackPath("/transactions#tx_1-a")).toBe("/transactions#tx_1-a");
    expect(safeBackPath("/transactions#a b")).toBe("/transactions");
    expect(safeBackPath("/transactions#<script>")).toBe("/transactions");
    expect(safeBackPath("/transactions#")).toBe("/transactions");
    expect(safeBackPath("/transactions#" + "x".repeat(41))).toBe("/transactions");
    expect(safeBackPath("/transactions#" + "x".repeat(40))).toBe("/transactions#" + "x".repeat(40));
    expect(safeBackPath("//evil.example#tx-1")).toBeNull();
    expect(safeBackPath("#tx-1")).toBeNull();
  });
  it("withFragment replaces any fragment, and withBack carries it", () => {
    expect(withFragment("/transactions?q=a", "tx-5")).toBe("/transactions?q=a#tx-5");
    expect(withFragment("/transactions#old", "tx-5")).toBe("/transactions#tx-5");
    expect(withFragment("/transactions", "bad id")).toBe("/transactions");
    expect(withBack("/transactions/5", "/transactions?page=2#tx-5")).toBe("/transactions/5?back=%2Ftransactions%3Fpage%3D2%23tx-5");
  });
});

describe("undo token", () => {
  const row: RestorableRow = {
    id: 7, date: "2026-10-09", type: "expense", amount: 350, accountId: 1, toAccountId: null, categoryId: 2, item: "teh tarik", merchant: null, note: "Kedai Ahmad",
    billId: null, shareId: null, importKey: "k1", clientId: null, importBatch: "b1", sharePrevItem: null, sharePrevCategoryId: null, createdAt: "2026-10-09 10:00:00",
  };
  it("round-trips, URL-safe, and drops nulls", () => {
    const token = encodeUndo(row);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = decodeUndo(token) as Record<string, unknown>;
    expect(back.item).toBe("teh tarik");
    expect(back.importKey).toBe("k1");
    expect("merchant" in back).toBe(false);
  });
  it("handles non-ASCII text", () => {
    expect((decodeUndo(encodeUndo({ ...row, item: "Nasi lemak ☕ — RM5" })) as { item: string }).item).toBe("Nasi lemak ☕ — RM5");
  });
  it("rejects junk", () => {
    expect(decodeUndo("!!!")).toBeNull();
    expect(decodeUndo("")).toBeNull();
    expect(decodeUndo(42)).toBeNull();
    expect(decodeUndo("abcd")).toBeNull();
  });
  it("travels in the address before a #fragment and is taken out again", () => {
    expect(withDeleted("/transactions?month=2026-10#tx-5", "TOK")).toBe("/transactions?month=2026-10&deleted=TOK#tx-5");
    expect(withDeleted("/transactions", "TOK")).toBe("/transactions?deleted=TOK");
    expect(takeDeleted("?month=2026-10&deleted=TOK")).toEqual({ token: "TOK", rest: "?month=2026-10" });
    expect(takeDeleted("?deleted=TOK")).toEqual({ token: "TOK", rest: "" });
    expect(takeDeleted("?month=2026-10")).toBeNull();
  });
});

describe("restoreTransaction judges a token like a new entry", () => {
  async function tokenFor(over: Partial<RestorableRow>): Promise<string> {
    const { deleteEntry } = await import("@/app/actions/transactions");
    const t = add();
    const r = await deleteEntry(fd({ id: String(t.id) }));
    const row = decodeUndo(r.undo!) as RestorableRow;
    return encodeUndo({ ...row, ...over });
  }
  it("refuses an impossible date and an amount over the ceiling", async () => {
    const { restoreTransaction } = await import("@/app/actions/transactions");
    expect((await restoreTransaction(await tokenFor({ date: "2026-13-45" }))).ok).toBe(false);
    expect((await restoreTransaction(await tokenFor({ amount: 2_000_000_000_00 }))).ok).toBe(false);
    expect(all()).toHaveLength(0);
  });
  it("drops a category of the wrong kind instead of restoring it", async () => {
    const { restoreTransaction } = await import("@/app/actions/transactions");
    // an expense restored with an income category (Salary) comes back uncategorised, not mis-filed
    expect((await restoreTransaction(await tokenFor({ categoryId: ids.salary }))).ok).toBe(true);
    expect(all()[0]).toMatchObject({ type: "expense", categoryId: null });
  });
});

describe("deleteEntry and restoreTransaction", () => {
  it("from a list it stays put and returns a token that restores the whole row", async () => {
    const { deleteEntry, restoreTransaction } = await import("@/app/actions/transactions");
    const bill = h.db.insert(recurringBills).values({ name: "Gym", accountId: ids.bank, amountMin: 500, amountMax: 500 }).returning().get();
    const t = add({ billId: bill.id, importKey: "key-1", importBatch: "batch-1", clientId: "uuid-1", merchant: "Kedai", note: "n", sharePrevItem: "old", sharePrevCategoryId: ids.food });
    const before = all()[0];
    const r = await deleteEntry(fd({ id: String(t.id) }));
    expect(r.ok).toBe(true);
    expect(all()).toHaveLength(0);
    expect(r.undo).toBeTruthy();
    const back = await restoreTransaction(r.undo!);
    expect(back.ok).toBe(true);
    expect(all()).toEqual([before]); // every column, including the id and the created-at time
  });

  it("from the entry page it redirects with ?deleted= and only to a path on this site", async () => {
    const { deleteEntry, restoreTransaction } = await import("@/app/actions/transactions");
    const t = add();
    const url = await redirected(deleteEntry(fd({ id: String(t.id), next: "/transactions?month=2026-10#tx-1" })));
    expect(url).toMatch(/^\/transactions\?month=2026-10&deleted=[A-Za-z0-9_-]+#tx-1$/);
    const token = takeDeleted(url!.slice(url!.indexOf("?"), url!.indexOf("#")))!.token;
    expect((await restoreTransaction(token)).ok).toBe(true);
    expect(all()).toHaveLength(1);
    const t2 = add();
    expect(await redirected(deleteEntry(fd({ id: String(t2.id), next: "https://evil.example" })))).toBeNull();
  });

  it("refuses to restore over an existing id, client id or bank line, and never makes a duplicate", async () => {
    const { deleteEntry, restoreTransaction } = await import("@/app/actions/transactions");
    const t = add({ clientId: "uuid-9", importKey: "key-9" });
    const { undo } = await deleteEntry(fd({ id: String(t.id) }));
    // the same bank line came back in a fresh import under a new id
    add({ importKey: "key-9" });
    const clash = await restoreTransaction(undo!);
    expect(clash.ok).toBe(false);
    expect(clash.error).toMatch(/bank line/);
    h.db.delete(transactions).run();
    add({ clientId: "uuid-9" });
    expect((await restoreTransaction(undo!)).error).toMatch(/phone id/);
    h.db.delete(transactions).run();
    // Restoring twice: the second time the id is taken.
    expect((await restoreTransaction(undo!)).ok).toBe(true);
    const again = await restoreTransaction(undo!);
    expect(again.ok).toBe(false);
    expect(all()).toHaveLength(1);
  });

  it("refuses a token that is not a restorable row, and leaves a vanished bill unlinked", async () => {
    const { restoreTransaction, deleteEntry } = await import("@/app/actions/transactions");
    expect((await restoreTransaction("not-a-token")).ok).toBe(false);
    expect((await restoreTransaction(encodeUndo({ id: 1, amount: -5 } as unknown as RestorableRow))).ok).toBe(false);
    const bill = h.db.insert(recurringBills).values({ name: "Gym", accountId: ids.bank, amountMin: 500, amountMax: 500 }).returning().get();
    const t = add({ billId: bill.id });
    const { undo } = await deleteEntry(fd({ id: String(t.id) }));
    h.db.delete(recurringBills).where(eq(recurringBills.id, bill.id)).run();
    expect((await restoreTransaction(undo!)).ok).toBe(true);
    expect(all()[0].billId).toBeNull();
  });

  it("a missing id deletes nothing", async () => {
    const { deleteEntry } = await import("@/app/actions/transactions");
    add();
    expect((await deleteEntry(fd({}))).ok).toBe(false);
    expect((await deleteEntry(fd({ id: "999" }))).undo).toBeUndefined();
    expect(all()).toHaveLength(1);
  });
});

describe("bulkSetCategory", () => {
  it("sets the category on every entry, in one go, and says how many", async () => {
    const { bulkSetCategory } = await import("@/app/actions/transactions");
    const a = add();
    const b = add({ amount: 900 });
    const r = await bulkSetCategory([a.id, b.id, a.id], ids.transport);
    expect(r).toMatchObject({ ok: true, changed: 2 });
    expect(all().map((t) => t.categoryId)).toEqual([ids.transport, ids.transport]);
  });

  it("refuses a mix of income and spending, a category of the wrong kind and any transfer, changing nothing", async () => {
    const { bulkSetCategory } = await import("@/app/actions/transactions");
    const spend = add();
    const pay = add({ type: "income", categoryId: ids.salary });
    const move = add({ type: "transfer", categoryId: null, toAccountId: ids.cash });
    expect((await bulkSetCategory([spend.id, pay.id], ids.food)).error).toMatch(/mixes/);
    expect((await bulkSetCategory([spend.id], ids.salary)).error).toMatch(/income category/);
    expect((await bulkSetCategory([pay.id], ids.food)).error).toMatch(/spending category/);
    const t = await bulkSetCategory([spend.id, move.id], ids.transport);
    expect(t.ok).toBe(false);
    expect(t.error).toMatch(/Transfers have no category/);
    expect(all().find((x) => x.id === move.id)!.categoryId).toBeNull();
    expect(all().find((x) => x.id === spend.id)!.categoryId).toBe(ids.food);
  });

  it("refuses unknown entries, an unknown category, nothing selected and more than 200", async () => {
    const { bulkSetCategory } = await import("@/app/actions/transactions");
    const a = add();
    expect((await bulkSetCategory([a.id, 9999], ids.transport)).error).toMatch(/no longer exist/);
    expect((await bulkSetCategory([a.id], 9999)).error).toMatch(/doesn't exist/);
    expect((await bulkSetCategory([], ids.transport)).error).toMatch(/at least one/);
    const many = Array.from({ length: BULK_MAX + 1 }, (_, i) => i + 1);
    expect((await bulkSetCategory(many, ids.transport)).error).toMatch(/200/);
    expect(all()[0].categoryId).toBe(ids.food);
  });

  it("needs an explicit yes for entries tied to a bill, a person or a bank import", async () => {
    const { bulkSetCategory } = await import("@/app/actions/transactions");
    const plain = add();
    const imported = add({ importKey: "k", importBatch: "b" });
    const refusal = await bulkSetCategory([plain.id, imported.id], ids.transport);
    expect(refusal).toMatchObject({ ok: false, changed: 0, needsConfirm: 1 });
    expect(all().every((t) => t.categoryId === ids.food)).toBe(true);
    expect(await bulkSetCategory([plain.id, imported.id], ids.transport, true)).toMatchObject({ ok: true, changed: 2 });
  });
});

describe("bulkDelete", () => {
  it("deletes the selection in one go and leaves the rest", async () => {
    const { bulkDelete } = await import("@/app/actions/transactions");
    const a = add();
    const b = add({ type: "transfer", categoryId: null, toAccountId: ids.cash });
    const keep = add();
    expect(await bulkDelete([a.id, b.id])).toMatchObject({ ok: true, changed: 2, message: "Deleted 2 entries." });
    expect(all().map((t) => t.id)).toEqual([keep.id]);
  });
  it("is all or nothing: one missing id, or a linked entry without the flag, deletes none", async () => {
    const { bulkDelete } = await import("@/app/actions/transactions");
    const a = add();
    const imported = add({ importKey: "k" });
    expect((await bulkDelete([a.id, 9999])).ok).toBe(false);
    expect((await bulkDelete([a.id, imported.id])).needsConfirm).toBe(1);
    expect(all()).toHaveLength(2);
    expect(await bulkDelete([a.id, imported.id], true)).toMatchObject({ ok: true, changed: 2 });
    expect(all()).toHaveLength(0);
  });
  it("takes at most 200", async () => {
    const { bulkDelete } = await import("@/app/actions/transactions");
    add();
    expect((await bulkDelete(Array.from({ length: 201 }, (_, i) => i + 1))).error).toMatch(/200/);
    expect(all()).toHaveLength(1);
  });
});

describe("entry-bulk (pure)", () => {
  const row = (o: Partial<BulkRow> = {}): BulkRow => ({ id: 1, type: "expense", amount: 100, billId: null, shareId: null, importKey: null, importBatch: null, ...o });
  it("cleanIds keeps positive whole numbers once each", () => {
    expect(cleanIds([3, "4", 3, 0, -1, 1.5, "x", null])).toEqual([3, 4]);
    expect(cleanIds("nope")).toEqual([]);
  });
  it("isLinked sees a bill, a person, an import key or a batch", () => {
    expect(isLinked(row())).toBe(false);
    expect([isLinked(row({ billId: 1 })), isLinked(row({ shareId: 1 })), isLinked(row({ importKey: "k" })), isLinked(row({ importBatch: "b" }))]).toEqual([true, true, true, true]);
  });
  it("plans set-category and delete", () => {
    const cat = { name: "Food", type: "expense" as const, archived: false };
    expect(planSetCategory([1], [row()], cat, false)).toEqual({ ok: true });
    expect(planSetCategory([1], [row()], { ...cat, archived: true }, false).ok).toBe(false);
    expect(planDelete([1, 2], [row()], false).ok).toBe(false);
    expect(planDelete([1], [row({ billId: 3 })], true)).toEqual({ ok: true });
  });
  it("words the delete sheet with the count and the totals", () => {
    const s = summarize([
      { type: "expense", amount: 1250, linked: false },
      { type: "income", amount: 500000, linked: true },
      { type: "transfer", amount: 3000, linked: false },
    ]);
    const sheet = bulkDeleteSheet(s);
    expect(sheet.title).toBe("Delete 3 entries?");
    expect(sheet.body.replace(/\s/g, " ")).toContain("RM 12.50 of spending (1)");
    expect(sheet.body.replace(/\s/g, " ")).toContain("RM 5,000.00 of income (1)");
    expect(sheet.body.replace(/\s/g, " ")).toContain("RM 30.00 moved between accounts (1)");
    expect(sheet.warnings).toHaveLength(1);
    expect(bulkDeleteSheet(summarize([{ type: "expense", amount: 1, linked: false }])).title).toBe("Delete 1 entry?");
    expect(categorySetMessage(1, "Food")).toBe("Moved 1 entry to Food.");
  });
});

describe("select bar and table logic", () => {
  it("counts an entry once though the phone list and the table both hold a box for it", () => {
    const t = { id: "5", type: "expense", amount: 100, linked: false };
    expect(uniqueTicked([t, { ...t }, { ...t, id: "6" }]).map((x) => x.id)).toEqual(["5", "6"]);
  });
  it("offers a category kind only for a one-kind selection with no transfers", () => {
    const one = (type: "income" | "expense" | "transfer") => ({ type, amount: 1, linked: false });
    expect(categoryKind(summarize([]))).toBeNull();
    expect(categoryKind(summarize([one("expense"), one("expense")]))).toBe("expense");
    expect(categoryKind(summarize([one("income")]))).toBe("income");
    expect(categoryKind(summarize([one("income"), one("expense")]))).toBeNull();
    expect(categoryKind(summarize([one("expense"), one("transfer")]))).toBeNull();
    expect(categoryHint(summarize([one("transfer")]))).toMatch(/Transfers have no category/);
    expect(categoryHint(summarize([one("income"), one("expense")]))).toMatch(/different categories/);
  });
  it("sort headers toggle and say which way they sort", () => {
    expect(sortHeader("", "date")).toMatchObject({ next: "oldest", aria: "descending" });
    expect(sortHeader("oldest", "date")).toMatchObject({ next: "", aria: "ascending" });
    expect(sortHeader("largest", "date")).toMatchObject({ next: "", aria: "none" });
    expect(sortHeader("", "amount")).toMatchObject({ next: "largest", aria: "none" });
    expect(sortHeader("largest", "amount")).toMatchObject({ next: "smallest", aria: "descending" });
    expect(sortHeader("smallest", "amount")).toMatchObject({ next: "largest", aria: "ascending" });
  });
  it("takeUndo gives a fresh notice once and nothing after 8 seconds", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    store.set(UNDO_KEY, JSON.stringify({ token: "T", at: 1000 }));
    expect(takeUndo(8000, 4000)).toEqual({ token: "T", left: 5000 });
    expect(takeUndo(8000, 4000)).toBeNull(); // taken
    store.set(UNDO_KEY, JSON.stringify({ token: "T", at: 1000 }));
    expect(takeUndo(8000, 9500)).toBeNull(); // too late
    store.set(UNDO_KEY, "junk");
    expect(takeUndo(8000, 1)).toBeNull();
    vi.unstubAllGlobals();
  });
});
