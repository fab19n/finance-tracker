import { count, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { billShares, billTurns, importRules, transactions } from "@/db/schema";
import { NO_USAGE, type BillUsage } from "@/lib/plan/bill-delete";

/** For every bill: how many payments, people, turns and learned import rules hang off it (what "Delete this bill" removes). */
export async function getBillUsage(): Promise<Map<number, BillUsage>> {
  const db = await getDb();
  const out = new Map<number, BillUsage>();
  const bump = (billId: number | null, key: keyof BillUsage, n: number) => {
    if (billId === null) return;
    out.set(billId, { ...(out.get(billId) ?? NO_USAGE), [key]: n });
  };
  for (const r of db.select({ id: transactions.billId, n: count() }).from(transactions).where(isNotNull(transactions.billId)).groupBy(transactions.billId).all()) bump(r.id, "payments", r.n);
  for (const r of db.select({ id: billShares.billId, n: count() }).from(billShares).groupBy(billShares.billId).all()) bump(r.id, "people", r.n);
  for (const r of db.select({ id: billTurns.billId, n: count() }).from(billTurns).groupBy(billTurns.billId).all()) bump(r.id, "turns", r.n);
  for (const r of db.select({ id: importRules.billId, n: count() }).from(importRules).where(isNotNull(importRules.billId)).groupBy(importRules.billId).all()) bump(r.id, "rules", r.n);
  return out;
}
