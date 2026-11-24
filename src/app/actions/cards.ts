"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { accounts } from "@/db/schema";
import { cleanLast4, HEX, markToStored } from "@/lib/card";
import { MAX_AMOUNT_MESSAGE, withinLimit } from "@/lib/limits";
import { parseSen } from "@/lib/money";

/** Where the card form lives: errors go back to it, success goes to the account's page. */
const formHref = (id: number, error?: string) => `/accounts/${id}/card${error ? `?error=${encodeURIComponent(error)}` : ""}`;

/**
 * Card settings for one account: the mark in the corner, a colour of your own (empty = the bank's), the last four
 * digits, and whether this is the Main (spending) or the Savings account. Nothing here touches an entry or a balance.
 */
export async function saveCardSettings(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) redirect("/accounts");
  const db = await getDb();
  const account = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!account) redirect("/accounts");

  const text = (k: string) => String(formData.get(k) ?? "");
  const color = text("color").trim();
  if (color && !HEX.test(color)) redirect(formHref(id, "That colour isn't valid"));
  const last4Raw = text("last4").trim();
  const last4 = last4Raw ? cleanLast4(last4Raw) : null;
  if (last4Raw && !last4) redirect(formHref(id, "The last digits must be exactly four numbers"));
  if (text("network") === "other" && !text("otherName").trim()) redirect(formHref(id, "Give the card mark a name, or pick None"));

  // The role: Main (spending) or Savings, one account each, never both on one account. A form without the fields leaves
  // the role alone; an investment can't hold either.
  const wantMain = formData.get("main") === "1";
  const wantSavings = formData.get("savings") === "1";
  if (wantMain && wantSavings) redirect(formHref(id, "An account is either Main or Savings, not both"));
  const role: "spending" | "savings" | null | undefined = wantMain
    ? "spending"
    : wantSavings
      ? "savings"
      : (formData.get("main") === "0" && account.purpose === "spending") || (formData.get("savings") === "0" && account.purpose === "savings")
        ? null
        : undefined;
  if (role && account.type === "investment") redirect(formHref(id, "An investment can't be your Main or Savings account"));
  if (role && account.archived) redirect(formHref(id, "An archived account can't be your Main or Savings account. Restore it first"));

  // One transaction: the card look and the role move together, so a failure can't leave no spending account at all.
  db.transaction((tx) => {
    tx.update(accounts)
      .set({ cardNetwork: markToStored(text("network"), text("otherName")), cardColor: color ? color.toLowerCase() : null, cardLast4: last4 })
      .where(eq(accounts.id, id))
      .run();
    // Choosing a role takes it from whoever had it.
    if (role) {
      tx.update(accounts).set({ purpose: null }).where(eq(accounts.purpose, role)).run();
      tx.update(accounts).set({ purpose: role }).where(eq(accounts.id, id)).run();
    } else if (role === null) {
      tx.update(accounts).set({ purpose: null }).where(eq(accounts.id, id)).run();
    }
  });

  revalidatePath("/", "layout");
  redirect(`/accounts/${id}`);
}

const NEW_TYPES = ["bank", "ewallet", "cash"] as const;
const newHref = (error: string) => `/accounts/new?error=${encodeURIComponent(error)}`;

/**
 * A new account from its own page: a name, what kind it is (bank, e-wallet or cash), an opening balance and, if you like,
 * the Main or Savings role. It starts as a plain card; the mark and colour are set afterwards in Card settings. Everything
 * is checked before anything is written, and taking a role from another account happens in the same transaction as the
 * insert. Investments are added in Settings (they need holdings).
 */
export async function addAccount(formData: FormData): Promise<void> {
  const text = (k: string) => String(formData.get(k) ?? "");
  const name = text("name").trim();
  if (!name) redirect(newHref("Account needs a name"));
  if (name.length > 60) redirect(newHref("That name is too long (60 letters at most)"));
  const type = NEW_TYPES.find((t) => t === text("type"));
  if (!type) redirect(newHref("Choose a bank, an e-wallet or cash"));

  const raw = text("openingBalance").trim();
  const negative = raw.startsWith("-");
  const parsed = raw ? parseSen(raw.replace(/^-/, "")) : 0;
  if (parsed === null) redirect(newHref("Opening balance isn't a valid amount"));
  const opening = negative ? -parsed : parsed;
  if (!withinLimit(opening)) redirect(newHref(MAX_AMOUNT_MESSAGE));

  const wantMain = formData.get("main") === "1";
  const wantSavings = formData.get("savings") === "1";
  if (wantMain && wantSavings) redirect(newHref("An account is either Main or Savings, not both"));
  const role = wantMain ? "spending" : wantSavings ? "savings" : null;

  const db = await getDb();
  const id = db.transaction((tx) => {
    if (role) tx.update(accounts).set({ purpose: null }).where(eq(accounts.purpose, role)).run();
    return tx.insert(accounts).values({ name, type: type!, openingBalance: opening, purpose: role, sortOrder: 99 }).returning({ id: accounts.id }).get().id;
  });

  revalidatePath("/", "layout");
  redirect(`/accounts/${id}`);
}
