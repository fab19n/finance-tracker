import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";

export type RiskProfile = "conservative" | "balanced" | "growth";

export type AppSettings = {
  /** Assumed fixed-deposit rate, % p.a. Check your bank - this is only a default. */
  fdRatePct: number;
  /** Assumed long-run nominal S&P 500 return, % p.a. Illustrative, not a promise. */
  sp500ReturnPct: number;
  /** Months of expenses to hold as an emergency fund. */
  emergencyMonths: number;
  riskProfile: RiskProfile;
  /** How many years the surplus can stay invested. */
  horizonYears: number;
  /** Usual payday (day of the month) until enough salary is recorded to work it out. */
  paydayDay: number;
  /** Take-home pay, sen. Used by the payday plan until a salary has been recorded. 0 = not set. */
  expectedIncome: number;
  /** What you allow for groceries, fuel, Touch 'n Go, food and small things per cycle, sen. 0 = not set. */
  variableAllowance: number;
  /** Cushion kept in the main account on top of bills + allowance, sen. */
  cycleBuffer: number;
  /** What your savings account pays today, % p.a. */
  savingsRatePct: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  fdRatePct: 3,
  sp500ReturnPct: 7,
  emergencyMonths: 6,
  riskProfile: "balanced",
  horizonYears: 10,
  paydayDay: 28,
  expectedIncome: 0,
  variableAllowance: 0,
  cycleBuffer: 10_000, // RM 100
  savingsRatePct: 0.25,
};

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rows = db.select().from(settings).all();
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    switch (key) {
      case "fdRatePct":
      case "sp500ReturnPct":
      case "emergencyMonths":
      case "horizonYears":
      case "paydayDay":
      case "expectedIncome":
      case "variableAllowance":
      case "cycleBuffer":
      case "savingsRatePct": {
        const n = Number(value);
        if (Number.isFinite(n)) out[key] = n;
        break;
      }
      case "riskProfile":
        if (value === "conservative" || value === "balanced" || value === "growth") {
          out.riskProfile = value;
        }
        break;
    }
  }
  return out;
}

export async function setSetting(key: keyof AppSettings, value: string | number): Promise<void> {
  const db = await getDb();
  db.insert(settings)
    .values({ key, value: String(value) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(value) } })
    .run();
}

export async function getRawSetting(key: string): Promise<string | undefined> {
  const db = await getDb();
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value;
}

export async function setRawSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}
