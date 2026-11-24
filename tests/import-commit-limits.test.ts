import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db/open";
import { accounts, categories } from "@/db/schema";
import { commitRows, rowShapeProblem } from "@/lib/import/commit";
import type { CommitRow } from "@/lib/import/api-types";

let db: DB, acc: number, food: number;
beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  db = openDb(":memory:");
  acc = db.select().from(accounts).all().find((a) => a.type === "bank")!.id;
  food = db.select().from(categories).all().find((c) => c.type === "expense")!.id;
});
const row = (o: Partial<CommitRow> = {}): CommitRow => ({
  key: "k1", date: "2026-05-01", amount: -1000, description: "SHOP", kind: "expense", categoryId: food, item: "Lunch", billId: null, shareId: null, transferAccountId: null, remember: false, ...o,
});

describe("commitRows validation", () => {
  it("refuses a date that has the shape but isn't a day, naming the row", () => {
    const r = commitRows(db, { accountId: acc, rows: [row(), row({ key: "k2", date: "2026-02-31" })], setOpeningBalance: null });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? "" : r.error).toMatch(/Row 2 .*date isn't valid/);
  });
  it("refuses an amount beyond the ceiling and an over-long Item, naming the row", () => {
    const big = commitRows(db, { accountId: acc, rows: [row({ amount: -(2 ** 52) })], setOpeningBalance: null });
    expect(big.ok ? "" : big.error).toMatch(/Row 1 .*too large/);
    const long = commitRows(db, { accountId: acc, rows: [row({ item: "x".repeat(121) })], setOpeningBalance: null });
    expect(long.ok ? "" : long.error).toMatch(/Row 1 .*Item is too long/);
  });
  it("rowShapeProblem names the row, counting only lines being imported", () => {
    const msg = rowShapeProblem([{ kind: "skip", item: "x".repeat(500) }, { kind: "expense", date: "2026-05-01", description: "SHOP", item: "x".repeat(130) }]);
    expect(msg).toMatch(/Row 1 \(2026-05-01 SHOP\): the Item is 130 characters/);
    expect(rowShapeProblem([{ kind: "expense", item: "ok" }])).toBeNull();
  });
});
