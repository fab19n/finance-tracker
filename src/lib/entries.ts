import { eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts, categories, type transactions } from "@/db/schema";
import { entryShapeError, type WireEntry } from "@/lib/entry-shape";

export type CheckedEntry =
  | { ok: true; row: Omit<typeof transactions.$inferInsert, "id" | "createdAt" | "clientId"> }
  | { ok: false; error: string };

/**
 * Everything that has to be true before an entry may be written, and the row to write. One rule book for both ways in: the
 * Add form's Server Action and the phone's sync (/sync/entries). A transfer carries no category and a spend or income no
 * destination, whatever else was sent along.
 */
export function checkEntry(db: DB, e: Omit<WireEntry, "clientId">): CheckedEntry {
  const shape = entryShapeError(e);
  if (shape) return { ok: false, error: shape };

  const accountExists = (id: number) => !!db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id)).get();
  if (!accountExists(e.accountId)) return { ok: false, error: "That account no longer exists" };

  let toAccountId: number | null = null;
  let categoryId: number | null = null;
  if (e.type === "transfer") {
    toAccountId = e.toAccountId;
    if (toAccountId === null || !accountExists(toAccountId)) return { ok: false, error: "That account no longer exists" };
  } else {
    categoryId = e.categoryId;
    const category = categoryId === null ? undefined : db.select().from(categories).where(eq(categories.id, categoryId)).get();
    if (!category) return { ok: false, error: "That category no longer exists" };
    if (category.type !== e.type) return { ok: false, error: "Category doesn't match the entry type" };
  }

  return {
    ok: true,
    row: {
      date: e.date,
      type: e.type,
      amount: e.amount,
      accountId: e.accountId,
      toAccountId,
      categoryId,
      item: e.item?.trim() || null,
      note: e.note?.trim() || null,
    },
  };
}
