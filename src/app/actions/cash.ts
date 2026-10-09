"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { SYSTEM_CASH_ADJUSTMENT, SYSTEM_UNACCOUNTED } from "@/db/seed";
import { transactions } from "@/db/schema";
import { reconcileCash } from "@/lib/analytics/cash-recon";
import { todayISO } from "@/lib/dates";
import { formatRM, parseSen } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import { getSystemCategoryId } from "@/lib/queries/reference";
import { setRawSetting } from "@/lib/settings";

/**
 * "Count my cash": compare the ledger's cash balance with what you actually have.
 * A shortfall is booked as an expense in "Unaccounted cash" so it shows up as a leak.
 */
export async function reconcileCashAction(formData: FormData): Promise<void> {
  const accountId = Number(formData.get("accountId"));
  const actual = parseSen(String(formData.get("actual") ?? ""));
  if (!accountId || actual === null) redirect("/insights?recon=invalid#cash");

  const balances = await getAccountBalances();
  const acc = balances.find((a) => a.id === accountId && a.type === "cash");
  if (!acc) redirect("/insights?recon=invalid#cash");

  const result = reconcileCash(acc.balance, actual);
  const today = todayISO();
  if (result.kind !== "match") {
    const db = await getDb();
    const categoryId = await getSystemCategoryId(result.kind === "shortfall" ? SYSTEM_UNACCOUNTED : SYSTEM_CASH_ADJUSTMENT);
    db.insert(transactions)
      .values({
        date: today,
        type: result.kind === "shortfall" ? "expense" : "income",
        amount: result.amount,
        accountId,
        categoryId,
        item: "Cash reconciliation",
        note: `Counted ${formatRM(actual)}, books said ${formatRM(acc.balance)}`,
      })
      .run();
  }
  await setRawSetting("lastCashReconcile", today);
  revalidatePath("/", "layout");
  redirect(`/insights?recon=${result.kind}&amt=${result.amount}#cash`);
}
