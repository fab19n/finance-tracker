"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { accounts, categories } from "@/db/schema";
import { MAX_AMOUNT_MESSAGE, withinLimit } from "@/lib/limits";
import { parseSen } from "@/lib/money";
import { setSetting } from "@/lib/settings";
import { savedParams, withParams, type SavedKey } from "@/lib/saved-notice";
import { settingsHref, type SettingsTab } from "@/lib/settings-tabs";

/** Back to the Settings tab the form was on (Accounts when no tab is named), showing `error` there if there is one. */
function done(error?: string, tab: SettingsTab = "accounts", saved?: { key: SavedKey; note?: string }): never {
  revalidatePath("/", "layout");
  redirect(saved && !error ? withParams(settingsHref(tab), savedParams(saved.key, saved.note)) : settingsHref(tab, error));
}

const ROLE_NAME = { spending: "Spending", savings: "Savings" } as const;

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
  if (!withinLimit(openingBalance)) done(MAX_AMOUNT_MESSAGE);
  const db = await getDb();
  const purpose = v.purpose || null;
  const existing = v.id ? db.select().from(accounts).where(eq(accounts.id, Number(v.id))).get() : undefined;
  if (v.id && !existing) done("That account no longer exists");
  // Everything is checked BEFORE a role is taken from its holder: a refusal must leave the books as they were.
  // The Plan assumes the spending and savings accounts are live bank, cash or e-wallet accounts.
  const roleAfter = v.purpose !== undefined ? purpose : (existing?.purpose ?? null);
  if (roleAfter && v.type === "investment") done("An investment can't be your spending or savings account");
  if (purpose && existing?.archived) done("An archived account can't be your spending or savings account. Restore it first");

  // Each role belongs to one account: giving it to this one takes it from whoever had it, and the notice says who.
  const holder = purpose ? db.select().from(accounts).where(eq(accounts.purpose, purpose)).all().find((a) => a.id !== Number(v.id ?? 0)) : undefined;
  db.transaction((tx) => {
    if (purpose) tx.update(accounts).set({ purpose: null }).where(eq(accounts.purpose, purpose)).run();
    if (v.id) {
      // A form without the role field (older callers) leaves the existing role alone.
      const set = { name: v.name, type: v.type, openingBalance, ...(v.purpose !== undefined ? { purpose } : {}) };
      tx.update(accounts).set(set).where(eq(accounts.id, Number(v.id))).run();
    } else {
      tx.insert(accounts).values({ name: v.name, type: v.type, openingBalance, purpose, sortOrder: 99 }).run();
    }
  });
  done(undefined, "accounts", {
    key: "account",
    note: purpose && holder ? `${v.name} is now your ${ROLE_NAME[purpose]} account; ${holder.name} no longer is.` : undefined,
  });
}

export async function toggleAccountArchived(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const archived = formData.get("archived") === "1";
  const db = await getDb();
  const before = db.select().from(accounts).where(eq(accounts.id, id)).get();
  // An archived account drops out of the Plan, so it also lets go of its role (otherwise restoring it later could
  // leave two accounts claiming the same role).
  db.update(accounts).set(archived ? { archived, purpose: null } : { archived }).where(eq(accounts.id, id)).run();
  const released = archived && before?.purpose ? ROLE_NAME[before.purpose] : null;
  done(undefined, "accounts", {
    key: archived ? "accountArchived" : "accountRestored",
    note: released ? `${before!.name} was your ${released} account and no longer is: choose another one (Plan asks for it).` : undefined,
  });
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
  if (budget !== null && !withinLimit(budget)) done(MAX_AMOUNT_MESSAGE, "categories");
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
  done(undefined, "categories", { key: "category" });
}

export async function toggleCategoryArchived(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const archived = formData.get("archived") === "1";
  const db = await getDb();
  const cat = db.select().from(categories).where(eq(categories.id, id)).get();
  if (cat?.isSystem) done("System categories can't be archived", "categories");
  db.update(categories).set({ archived }).where(eq(categories.id, id)).run();
  done(undefined, "categories", { key: archived ? "categoryArchived" : "categoryRestored" });
}

/** What each number on the Investing and Payday tabs is called and what it accepts, so a refusal can name the field. */
type FieldRule = { label: string; rule: string };
const ASSUMPTION_FIELDS: Record<string, FieldRule> = {
  fdRatePct: { label: "FD rate", rule: "between 0 and 30" },
  sp500ReturnPct: { label: "S&P 500 return", rule: "between -20 and 30" },
  emergencyMonths: { label: "Emergency fund (months)", rule: "a whole number from 0 to 36" },
  horizonYears: { label: "Investing horizon (years)", rule: "a whole number from 1 to 60" },
  riskProfile: { label: "Risk profile", rule: "one of the three choices" },
};
const CYCLE_FIELDS: Record<string, FieldRule> = {
  paydayDay: { label: "Usual payday", rule: "a day of the month from 1 to 31" },
  savingsRatePct: { label: "Savings account rate", rule: "between 0 and 15" },
};

/** "Usual payday must be a day of the month from 1 to 31", from the first check that failed. */
function fieldProblem(issue: { path: PropertyKey[] } | undefined, fields: Record<string, FieldRule>, fallback: string): string {
  const key = issue?.path[0];
  const f = typeof key === "string" ? fields[key] : undefined;
  return f ? `${f.label} must be ${f.rule}` : `${fallback}: one of the numbers is out of range`;
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
  if (!p.success) done(fieldProblem(p.error.issues[0], ASSUMPTION_FIELDS, "Check the investing assumptions"), "investing");
  for (const [k, v] of Object.entries(p.data!)) {
    await setSetting(k as keyof typeof p.data, v);
  }
  done(undefined, "investing", { key: "assumptions" });
}

const CycleSettingsInput = z.object({
  paydayDay: z.coerce.number().int().min(1).max(31),
  expectedIncome: z.string().optional(),
  variableAllowance: z.string().optional(),
  cycleBuffer: z.string().optional(),
  savingsRatePct: z.coerce.number().min(0).max(15),
  dailyLimit: z.string().optional(),
});

/** Money fields arrive as RM text; blank means "not set" (0). */
function rmOrZero(v: string | undefined): number | null {
  if (!v?.trim()) return 0;
  return parseSen(v);
}

export async function saveCycleSettings(formData: FormData): Promise<void> {
  const p = CycleSettingsInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(fieldProblem(p.error.issues[0], CYCLE_FIELDS, "Check the payday settings"), "payday");
  const v = p.data!;
  const income = rmOrZero(v.expectedIncome);
  const allowance = rmOrZero(v.variableAllowance);
  const buffer = rmOrZero(v.cycleBuffer);
  const daily = rmOrZero(v.dailyLimit);
  if (income === null || allowance === null || buffer === null || daily === null) done("One of the RM amounts isn't valid", "payday");
  if (![income, allowance, buffer, daily].every((n) => withinLimit(n!))) done(MAX_AMOUNT_MESSAGE, "payday");
  await setSetting("paydayDay", v.paydayDay);
  await setSetting("expectedIncome", income!);
  await setSetting("variableAllowance", allowance!);
  await setSetting("cycleBuffer", buffer!);
  await setSetting("savingsRatePct", v.savingsRatePct);
  // Blank turns the daily limit off; a form without the field at all leaves it as it was.
  if (v.dailyLimit !== undefined) await setSetting("dailyLimit", daily!);
  done(undefined, "payday", { key: "payday" });
}
