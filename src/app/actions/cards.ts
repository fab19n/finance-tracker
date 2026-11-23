"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { accounts } from "@/db/schema";
import { cleanLast4, HEX, markToStored } from "@/lib/card";

/** Where the card form lives: errors go back to it, success goes to the account's page. */
const formHref = (id: number, error?: string) => `/accounts/${id}/card${error ? `?error=${encodeURIComponent(error)}` : ""}`;

/**
 * Card settings for one account: the mark in the corner, a colour of your own (empty = the bank's), the last four
 * digits, and whether this is the Main (spending) account. Nothing here touches an entry or a balance.
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

  db.update(accounts)
    .set({ cardNetwork: markToStored(text("network"), text("otherName")), cardColor: color ? color.toLowerCase() : null, cardLast4: last4 })
    .where(eq(accounts.id, id))
    .run();

  // "Main" is the spending role, which belongs to one account: choosing it here takes it from whoever had it. A form
  // without the field leaves the role alone; an investment can't be the spending account.
  const main = formData.get("main");
  if (main === "1" && account.type !== "investment") {
    db.update(accounts).set({ purpose: null }).where(eq(accounts.purpose, "spending")).run();
    db.update(accounts).set({ purpose: "spending" }).where(eq(accounts.id, id)).run();
  } else if (main === "0" && account.purpose === "spending") {
    db.update(accounts).set({ purpose: null }).where(eq(accounts.id, id)).run();
  }

  revalidatePath("/", "layout");
  redirect(`/accounts/${id}`);
}
