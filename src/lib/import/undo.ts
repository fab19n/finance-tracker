import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, importBatches, transactions } from "@/db/schema";

export type UndoResult = { ok: true; removed: number; openingRestored: boolean } | { ok: false; error: string };

export const UNKNOWN_BATCH = "That import was already undone, or it no longer exists.";

/**
 * Take back one statement import, all or nothing: delete exactly the entries it wrote (including any since edited), put
 * back the opening balance if the import set one, and forget the batch. Learned rules are left alone. A second call finds
 * no batch and changes nothing.
 */
export function undoImportBatch(db: DB, batchId: string): UndoResult {
  if (typeof batchId !== "string" || !batchId || batchId.length > 100) return { ok: false, error: UNKNOWN_BATCH };
  return db.transaction((tx) => {
    const batch = tx.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
    if (!batch) return { ok: false as const, error: UNKNOWN_BATCH };
    const removed = tx.delete(transactions).where(eq(transactions.importBatch, batchId)).run().changes;
    let openingRestored = false;
    // The opening balance goes back only if nothing later relied on it: a newer import into the same account (or an edit made
    // in Settings after it) would be silently overwritten by an older value.
    const newer = tx
      .select({ id: importBatches.id })
      .from(importBatches)
      .where(and(eq(importBatches.accountId, batch.accountId), gt(importBatches.createdAt, batch.createdAt)))
      .get();
    if (batch.openingBefore !== null && !newer) {
      tx.update(accounts).set({ openingBalance: batch.openingBefore }).where(eq(accounts.id, batch.accountId)).run();
      openingRestored = true;
    }
    tx.delete(importBatches).where(eq(importBatches.id, batchId)).run();
    return { ok: true as const, removed, openingRestored };
  });
}

export type RecentImport = { id: string; createdAt: string; accountName: string; count: number; setOpening: boolean; transfers: number };

/** The latest imports that can still be undone, newest first. `count` is what is left of them now. */
export function listRecentImports(db: DB, limit = 5): RecentImport[] {
  return db
    .select({
      id: importBatches.id,
      createdAt: importBatches.createdAt,
      accountName: accounts.name,
      opening: importBatches.openingBefore,
      count: sql<number>`(SELECT count(*) FROM transactions t WHERE t.import_batch = ${importBatches.id})`,
      transfers: sql<number>`(SELECT count(*) FROM transactions t WHERE t.import_batch = ${importBatches.id} AND t.type = 'transfer')`,
    })
    .from(importBatches)
    .innerJoin(accounts, eq(accounts.id, importBatches.accountId))
    .orderBy(desc(importBatches.createdAt), desc(sql`import_batches.rowid`))
    .limit(limit)
    .all()
    .map((r) => ({ id: r.id, createdAt: r.createdAt, accountName: r.accountName, count: r.count, setOpening: r.opening !== null, transfers: r.transfers }));
}
