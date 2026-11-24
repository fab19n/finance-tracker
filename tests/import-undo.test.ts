import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, categories, importBatches, importRules, transactions } from "@/db/schema";
import { commitRows } from "@/lib/import/commit";
import type { CommitRow } from "@/lib/import/api-types";
import { listRecentImports, undoImportBatch, UNKNOWN_BATCH } from "@/lib/import/undo";

let db: DB, acc: number, other: number, food: number;
beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  db = openDb(":memory:");
  const banks = db.select().from(accounts).all().filter((a) => a.type !== "investment");
  acc = banks[0].id;
  other = banks[1].id;
  food = db.select().from(categories).all().find((c) => c.type === "expense")!.id;
});
const row = (o: Partial<CommitRow> = {}): CommitRow => ({
  key: "k1", date: "2026-05-01", amount: -1000, description: "SHOP", kind: "expense", categoryId: food, item: "Lunch", billId: null, shareId: null, transferAccountId: null, remember: false, ...o,
});
const opening = (id: number) => db.select().from(accounts).where(eq(accounts.id, id)).get()!.openingBalance;
const count = () => db.select({ n: sql<number>`count(*)` }).from(transactions).get()!.n;
const batchOf = (r: ReturnType<typeof commitRows>) => (r.ok ? (r.batchId ?? "") : "");

describe("commitRows stamps an import batch", () => {
  it("gives every entry it writes (transfers too) the same batch id, and records the batch", () => {
    const r = commitRows(db, { accountId: acc, setOpeningBalance: null, rows: [row(), row({ key: "k2" }), row({ key: "k3", kind: "transfer", categoryId: null, transferAccountId: other })] });
    expect(r.ok).toBe(true);
    const id = batchOf(r);
    expect(id).toBeTruthy();
    const stamped = db.select().from(transactions).all();
    expect(stamped).toHaveLength(3);
    expect(new Set(stamped.map((t) => t.importBatch))).toEqual(new Set([id]));
    expect(db.select().from(importBatches).all()).toMatchObject([{ id, accountId: acc, rowCount: 3, openingBefore: null }]);
  });
  it("makes no batch when nothing was written, and leaves hand-typed entries unstamped", () => {
    db.insert(transactions).values({ date: "2026-05-02", type: "expense", amount: 5, accountId: acc }).run();
    const r = commitRows(db, { accountId: acc, setOpeningBalance: null, rows: [row({ kind: "skip" })] });
    expect(r).toMatchObject({ ok: true, imported: 0, batchId: null });
    expect(db.select().from(importBatches).all()).toHaveLength(0);
    expect(db.select().from(transactions).all()[0].importBatch).toBeNull();
  });
  it("writes no batch when the commit is refused", () => {
    const r = commitRows(db, { accountId: acc, setOpeningBalance: null, rows: [row(), row({ key: "k2", date: "2026-02-31" })] });
    expect(r.ok).toBe(false);
    expect(db.select().from(importBatches).all()).toHaveLength(0);
  });
});

describe("undoImportBatch", () => {
  it("deletes only that import's entries, restores the opening balance it set, and keeps learned rules", () => {
    db.update(accounts).set({ openingBalance: 12345 }).where(eq(accounts.id, acc)).run();
    db.insert(transactions).values({ date: "2026-06-01", type: "expense", amount: 700, accountId: other }).run(); // hand-typed, elsewhere
    const first = commitRows(db, { accountId: other, setOpeningBalance: null, rows: [row({ key: "a1", remember: true, description: "Starbucks Mid Valley" })] });
    const second = commitRows(db, { accountId: acc, setOpeningBalance: 99900, rows: [row({ key: "b1" }), row({ key: "b2", amount: -250 })] });
    expect(second).toMatchObject({ ok: true, openingSet: true });
    expect(opening(acc)).toBe(99900);
    expect(count()).toBe(4);
    const rules = db.select().from(importRules).all().length;
    expect(rules).toBeGreaterThan(0);

    expect(undoImportBatch(db, batchOf(second))).toEqual({ ok: true, removed: 2, openingRestored: true });
    expect(opening(acc)).toBe(12345);
    expect(count()).toBe(2); // the hand-typed one and the first import
    expect(db.select().from(transactions).all().filter((t) => t.importBatch === batchOf(first))).toHaveLength(1);
    expect(db.select().from(importRules).all()).toHaveLength(rules);
  });
  it("removes entries edited since, and leaves the opening balance alone when the import didn't set one", () => {
    db.update(accounts).set({ openingBalance: 500 }).where(eq(accounts.id, acc)).run();
    const r = commitRows(db, { accountId: acc, setOpeningBalance: null, rows: [row()] });
    db.update(transactions).set({ item: "edited by hand", amount: 4242 }).where(eq(transactions.importKey, "k1")).run();
    expect(undoImportBatch(db, batchOf(r))).toEqual({ ok: true, removed: 1, openingRestored: false });
    expect(count()).toBe(0);
    expect(opening(acc)).toBe(500);
  });
  it("refuses a second undo and an unknown batch, changing nothing", () => {
    const id = batchOf(commitRows(db, { accountId: acc, setOpeningBalance: null, rows: [row()] }));
    expect(undoImportBatch(db, id).ok).toBe(true);
    db.insert(transactions).values({ date: "2026-06-01", type: "expense", amount: 700, accountId: acc }).run();
    expect(undoImportBatch(db, id)).toEqual({ ok: false, error: UNKNOWN_BATCH });
    expect(undoImportBatch(db, "nope")).toEqual({ ok: false, error: UNKNOWN_BATCH });
    expect(undoImportBatch(db, "")).toEqual({ ok: false, error: UNKNOWN_BATCH });
    expect(count()).toBe(1);
  });
  it("lists the last five imports, newest first, with what is left of each", () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(batchOf(commitRows(db, { accountId: acc, setOpeningBalance: null, rows: [row({ key: `k${i}` }), row({ key: `j${i}` })] })));
    const list = listRecentImports(db, 5);
    expect(list.map((x) => x.id)).toEqual(ids.slice(1).reverse());
    expect(list[0]).toMatchObject({ count: 2, setOpening: false });
    db.delete(transactions).where(eq(transactions.importKey, "k5")).run();
    expect(listRecentImports(db, 1)[0].count).toBe(1);
  });
});

describe("migration 0009: import batches", () => {
  it("gives a database from before it the column, the index and the table, keeping every entry", async () => {
    const { default: Database } = await import("better-sqlite3");
    const { drizzle } = await import("drizzle-orm/better-sqlite3");
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    // A migrations folder holding only the migrations before this one, as a database last opened before this change has.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mig-"));
    fs.mkdirSync(path.join(dir, "meta"));
    const journal = JSON.parse(fs.readFileSync(path.join("drizzle", "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };
    const old = { ...journal, entries: journal.entries.filter((e) => !e.tag.startsWith("0009")) };
    fs.writeFileSync(path.join(dir, "meta", "_journal.json"), JSON.stringify(old));
    for (const e of old.entries) fs.copyFileSync(path.join("drizzle", `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const d = drizzle(sqlite);
    migrate(d, { migrationsFolder: dir });
    const cols = (t: string) => (sqlite.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    expect(cols("transactions")).not.toContain("import_batch");
    sqlite.prepare("INSERT INTO accounts (name, type) VALUES ('Old', 'bank')").run();
    sqlite.prepare("INSERT INTO transactions (date, type, amount, account_id) VALUES ('2026-01-01', 'expense', 100, 1)").run();

    migrate(d, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    expect(cols("transactions")).toContain("import_batch");
    expect(sqlite.prepare("SELECT import_batch FROM transactions").all()).toEqual([{ import_batch: null }]);
    expect(sqlite.prepare("SELECT name FROM pragma_index_list('transactions') WHERE name = 'tx_import_batch_idx'").all()).toHaveLength(1);
    expect(cols("import_batches")).toEqual(["id", "created_at", "account_id", "row_count", "opening_before"]);
    sqlite.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("undo and the opening balance", () => {
  it("puts the opening balance back only for the latest import into that account", () => {
    db.update(accounts).set({ openingBalance: 500 }).where(eq(accounts.id, acc)).run();
    const first = commitRows(db, { accountId: acc, setOpeningBalance: 1000, rows: [row({ key: "p1" })] });
    // a later import into the same account (a newer batch) relies on the opening balance the first one set
    db.run(sql`UPDATE import_batches SET created_at = datetime('now', '-1 day')`);
    const second = commitRows(db, { accountId: acc, setOpeningBalance: null, rows: [row({ key: "p2", date: "2026-05-03" })] });
    expect(second.ok).toBe(true);
    const undone = undoImportBatch(db, batchOf(first));
    expect(undone).toMatchObject({ ok: true, openingRestored: false });
    expect(opening(acc)).toBe(1000);
  });
  it("reports how many transfers an import holds, so the warning can name them", () => {
    commitRows(db, { accountId: acc, setOpeningBalance: null, rows: [row({ key: "t1", kind: "transfer", categoryId: null, transferAccountId: other }), row({ key: "t2" })] });
    expect(listRecentImports(db)[0]).toMatchObject({ count: 2, transfers: 1 });
  });
});
