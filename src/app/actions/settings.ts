"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { accounts, categories } from "@/db/schema";
import { parseSen } from "@/lib/money";
import { setSetting } from "@/lib/settings";

function done(error?: string): never {
  revalidatePath("/", "layout");
  redirect(error ? `/settings?error=${encodeURIComponent(error)}` : "/settings");
}

const AccountInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Account needs a name").max(60),
  type: z.enum(["bank", "cash", "ewallet", "investment"]),
  openingBalance: z.string().optional(),
});

export async function saveAccount(formData: FormData): Promise<void> {
  const p = AccountInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(p.error.issues[0]?.message);
  const v = p.data!;
  const opening = v.openingBalance?.trim() ? parseSen(v.openingBalance.replace(/^-/, "")) : 0;
  if (opening === null) done("Opening balance isn't a valid amount");
  const negative = v.openingBalance?.trim().startsWith("-");
  const openingBalance = negative ? -opening! : opening!;
  const db = await getDb();
  if (v.id) {
    db.update(accounts)
      .set({ name: v.name, type: v.type, openingBalance })
      .where(eq(accounts.id, Number(v.id)))
      .run();
  } else {
    db.insert(accounts).values({ name: v.name, type: v.type, openingBalance, sortOrder: 99 }).run();
  }
  done();
}

export async function toggleAccountArchived(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const archived = formData.get("archived") === "1";
  const db = await getDb();
  db.update(accounts).set({ archived }).where(eq(accounts.id, id)).run();
  done();
}

const CategoryInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Category needs a name").max(40),
  type: z.enum(["income", "expense"]),
  nature: z.enum(["need", "want", "saving"]),
  icon: z.string().trim().max(4).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  monthlyBudget: z.string().optional(),
});

export async function saveCategory(formData: FormData): Promise<void> {
  const p = CategoryInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(p.error.issues[0]?.message);
  const v = p.data!;
  const budget = v.monthlyBudget?.trim() ? parseSen(v.monthlyBudget) : null;
  if (v.monthlyBudget?.trim() && budget === null) done("Budget isn't a valid amount");
  const row = {
    name: v.name,
    type: v.type,
    nature: v.nature,
    icon: v.icon || "•",
    color: v.color ?? "#64748b",
    monthlyBudget: v.type === "expense" ? budget : null,
  };
  const db = await getDb();
  if (v.id) {
    db.update(categories).set(row).where(eq(categories.id, Number(v.id))).run();
  } else {
    db.insert(categories).values({ ...row, sortOrder: 99 }).run();
  }
  done();
}

export async function toggleCategoryArchived(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const archived = formData.get("archived") === "1";
  const db = await getDb();
  const cat = db.select().from(categories).where(eq(categories.id, id)).get();
  if (cat?.isSystem) done("System categories can't be archived");
  db.update(categories).set({ archived }).where(eq(categories.id, id)).run();
  done();
}

const AssumptionsInput = z.object({
  fdRatePct: z.coerce.number().min(0).max(30),
  sp500ReturnPct: z.coerce.number().min(-20).max(30),
  emergencyMonths: z.coerce.number().int().min(0).max(36),
  horizonYears: z.coerce.number().int().min(1).max(60),
  riskProfile: z.enum(["conservative", "balanced", "growth"]),
});

export async function saveAssumptions(formData: FormData): Promise<void> {
  const p = AssumptionsInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done("Check the investing assumptions - one of the numbers is out of range");
  for (const [k, v] of Object.entries(p.data!)) {
    await setSetting(k as keyof typeof p.data, v);
  }
  done();
}
