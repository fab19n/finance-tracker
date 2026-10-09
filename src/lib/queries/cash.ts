import { and, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { SYSTEM_CASH_ADJUSTMENT, SYSTEM_UNACCOUNTED } from "@/db/seed";
import { transactions } from "@/db/schema";
import { shiftDays } from "@/lib/dates";
import { getRawSetting } from "@/lib/settings";
import { getAccountBalances } from "./accounts";
import { getSystemCategoryId } from "./reference";

export type CashStatus = {
  accounts: { id: number; name: string; ledgerBalance: number }[];
  ledgerTotal: number;
  /** Cash moved in from banks / e-wallets over the last 90 days. */
  withdrawn90: number;
  /** Net money found missing in cash counts over the last 90 days (never negative). */
  unaccounted90: number;
  lastReconciled: string | null;
};

export async function getCashStatus(today: string): Promise<CashStatus> {
  const balances = await getAccountBalances();
  const cash = balances.filter((a) => a.type === "cash");
  const cashIds = cash.map((a) => a.id);
  const db = await getDb();
  const since = shiftDays(today, -89);

  let withdrawn90 = 0;
  if (cashIds.length) {
    withdrawn90 =
      db
        .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.type, "transfer"),
            inArray(transactions.toAccountId, cashIds),
            notInArray(transactions.accountId, cashIds),
            gte(transactions.date, since),
          ),
        )
        .get()?.total ?? 0;
  }

  const sumIn = async (categoryName: string, type: "expense" | "income") => {
    const id = await getSystemCategoryId(categoryName);
    if (!id) return 0;
    return (
      db
        .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)` })
        .from(transactions)
        .where(and(eq(transactions.categoryId, id), eq(transactions.type, type), gte(transactions.date, since)))
        .get()?.total ?? 0
    );
  };
  const shortfalls = await sumIn(SYSTEM_UNACCOUNTED, "expense");
  const surpluses = await sumIn(SYSTEM_CASH_ADJUSTMENT, "income");

  return {
    accounts: cash.map((a) => ({ id: a.id, name: a.name, ledgerBalance: a.balance })),
    ledgerTotal: cash.reduce((s, a) => s + a.balance, 0),
    withdrawn90,
    unaccounted90: Math.max(0, shortfalls - surpluses),
    lastReconciled: (await getRawSetting("lastCashReconcile")) ?? null,
  };
}
