"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { accounts, categories } from "@/db/schema";
import { parseSen } from "@/lib/money";
import { setSetting } from "@/lib/settings";
import { settingsHref, type SettingsTab } from "@/lib/settings-tabs";

/** Back to the Settings tab the form was on (Accounts when no tab is named), showing `error` there if there is one. */
function done(error?: string, tab: SettingsTab = "accounts"): never {
  revalidatePath("/", "layout");
  redirect(settingsHref(tab, error));
}

const AccountInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Account needs a name").max(60),
  type: z.enum(["bank", "cash", "ewallet", "investment"]),
  openingBalance: z.string().optional(),
  // '' = no special role
  purpose: z.enum(["", "spending", "savings"]).optional(),
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
  const purpose = v.purpose || null;
  // Each role belongs to one account: giving it to this one takes it from whoever had it.
  if (purpose) db.update(accounts).set({ purpose: null }).where(eq(accounts.purpose, purpose)).run();
  if (v.id) {
    // A form without the role field (older callers) leaves the existing role alone.
    const set = { name: v.name, type: v.type, openingBalance, ...(v.purpose !== undefined ? { purpose } : {}) };
    db.update(accounts).set(set).where(eq(accounts.id, Number(v.id))).run();
  } else {
    db.insert(accounts).values({ name: v.name, type: v.type, openingBalance, purpose, sortOrder: 99 }).run();
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
  if (!p.success) done(p.error.issues[0]?.message, "categories");
  const v = p.data!;
  const budget = v.monthlyBudget?.trim() ? parseSen(v.monthlyBudget) : null;
  if (v.monthlyBudget?.trim() && budget === null) done("Budget isn't a valid amount", "categories");
  // The emoji is no longer shown anywhere (the design has no emoji), so the form has no field for it. A category saved
  // without one KEEPS the icon it has (an update leaves it out), and a new one gets a bullet.
  const row = {
    name: v.name,
    type: v.type,
    nature: v.nature,
    ...(v.icon ? { icon: v.icon } : {}),
    color: v.color ?? "#64748b",
    monthlyBudget: v.type === "expense" ? budget : null,
  };
  const db = await getDb();
  if (v.id) {
    db.update(categories).set(row).where(eq(categories.id, Number(v.id))).run();
  } else {
    db.insert(categories).values({ icon: "•", ...row, sortOrder: 99 }).run();
  }
  done(undefined, "categories");
}

export async function toggleCategoryArchived(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const archived = formData.get("archived") === "1";
  const db = await getDb();
  const cat = db.select().from(categories).where(eq(categories.id, id)).get();
  if (cat?.isSystem) done("System categories can't be archived", "categories");
  db.update(categories).set({ archived }).where(eq(categories.id, id)).run();
  done(undefined, "categories");
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
  if (!p.success) done("Check the investing assumptions - one of the numbers is out of range", "investing");
  for (const [k, v] of Object.entries(p.data!)) {
    await setSetting(k as keyof typeof p.data, v);
  }
  done(undefined, "investing");
}

const CycleSettingsInput = z.object({
  paydayDay: z.coerce.number().int().min(1).max(31),
  expectedIncome: z.string().optional(),
  variableAllowance: z.string().optional(),
  cycleBuffer: z.string().optional(),
  savingsRatePct: z.coerce.number().min(0).max(15),
});

/** Money fields arrive as RM text; blank means "not set" (0). */
function rmOrZero(v: string | undefined): number | null {
  if (!v?.trim()) return 0;
  return parseSen(v);
}

export async function saveCycleSettings(formData: FormData): Promise<void> {
  const p = CycleSettingsInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done("Check the payday settings - one of the numbers is out of range", "payday");
  const v = p.data!;
  const income = rmOrZero(v.expectedIncome);
  const allowance = rmOrZero(v.variableAllowance);
  const buffer = rmOrZero(v.cycleBuffer);
  if (income === null || allowance === null || buffer === null) done("One of the RM amounts isn't valid", "payday");
  await setSetting("paydayDay", v.paydayDay);
  await setSetting("expectedIncome", income!);
  await setSetting("variableAllowance", allowance!);
  await setSetting("cycleBuffer", buffer!);
  await setSetting("savingsRatePct", v.savingsRatePct);
  done(undefined, "payday");
}
