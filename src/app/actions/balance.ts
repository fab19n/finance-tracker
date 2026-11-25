"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { accounts, categories, transactions } from "@/db/schema";
import { interestCategory, judgeBalance, type BalanceUpdateInput, type BalanceUpdateResult } from "@/lib/balance-update";
import { isRealDate, shiftDays, shortDate, todayISO } from "@/lib/dates";
import { booksBalanceBefore } from "@/lib/import/books";
import { MAX_AMOUNT_MESSAGE, withinLimit } from "@/lib/limits";
import { formatRM, parseSen } from "@/lib/money";

const refuse = (message: string): BalanceUpdateResult => ({ kind: "error", message });

/**
 * Compare what the bank shows with the app's balance at the END of that day. The first call only says what it found;
 * it records the difference, as income, only when asked again with the same figure in `confirm`. So a double tap, a
 * changed box or an entry added in between can never record something you did not see. Once recorded, the balances
 * agree, and asking again records nothing.
 */
export async function updateBalance(input: BalanceUpdateInput): Promise<BalanceUpdateResult> {
  const date = String(input?.date ?? "");
  if (!isRealDate(date)) return refuse("Pick a valid date");
  if (date > todayISO()) return refuse("That day hasn't happened yet");
  const shown = parseSen(String(input.balance ?? ""));
  if (shown === null) return refuse("Enter the balance your bank shows, like 2006.58 (at most 2 decimals)");
  if (!withinLimit(shown)) return refuse(MAX_AMOUNT_MESSAGE);

  const db = await getDb();
  const result = db.transaction((): BalanceUpdateResult => {
    const account = db.select().from(accounts).where(eq(accounts.id, Number(input.accountId))).get();
    if (!account) return refuse("That account no longer exists");
    if (account.archived) return refuse("This account is archived");
    if (account.type !== "bank" && account.type !== "ewallet") return refuse("Only bank and e-wallet accounts can be updated this way");

    const books = booksBalanceBefore(db, account.id, shiftDays(date, 1));
    const verdict = judgeBalance(books, shown);
    const on = shortDate(date);
    if (verdict.kind === "match") return { kind: "match", message: `Already up to date: the app also has ${formatRM(books)} on ${on}. Nothing to record.` };
    if (verdict.kind === "lower") {
      return {
        kind: "lower",
        message: `Your bank shows ${formatRM(verdict.short)} less than the app's ${formatRM(books)} on ${on}. That isn't interest: spending or money moved out is probably missing. Add it, then check again. Nothing was recorded.`,
      };
    }

    const income = db.select().from(categories).where(and(eq(categories.type, "income"), eq(categories.archived, false))).orderBy(categories.sortOrder, categories.id).all();
    const category = interestCategory(income);
    if (!category) return refuse("Add an income category first (Settings > Categories)");

    const confirmed = input.confirm === verdict.amount;
    if (!confirmed || (verdict.unusual && !input.trusted)) {
      return { kind: "confirm", interest: verdict.amount, books, shown, category: category.name, unusual: verdict.unusual, needsTick: confirmed };
    }

    db.insert(transactions)
      .values({
        date,
        type: "income",
        amount: verdict.amount,
        accountId: account.id,
        categoryId: category.id,
        item: "Interest",
        note: `Balance update: the bank showed ${formatRM(shown)}, the app had ${formatRM(books)}`,
      })
      .run();
    return { kind: "recorded", message: `Recorded ${formatRM(verdict.amount)} as ${category.name}. The app now has ${formatRM(shown)} on ${on}.` };
  });
  if (result.kind === "recorded") revalidatePath("/", "layout");
  return result;
}
