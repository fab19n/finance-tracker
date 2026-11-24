import type { SettingsTab } from "@/lib/settings-tabs";
import { settingsHref } from "@/lib/settings-tabs";

/** What the first-run checklist needs to know. Plain facts, so the decision is testable without a database. */
export type SetupFacts = {
  /** Active (not archived) accounts. */
  accountCount: number;
  hasSpendingAccount: boolean;
  hasSavingsAccount: boolean;
  /** A salary has been recorded, or an expected income has been entered in Settings. */
  paydayKnown: boolean;
  /** At least one entry (income, spending or transfer) exists. */
  hasEntries: boolean;
};

export type SetupStepId = "accounts" | "spending" | "savings" | "payday" | "entry";

export type SetupStep = { id: SetupStepId; title: string; text: string; href: string; tab?: SettingsTab };

/** The steps still missing, in the order to do them. An empty list means setup is done. */
export function missingSetupSteps(f: SetupFacts): SetupStep[] {
  const steps: SetupStep[] = [];
  if (f.accountCount === 0) {
    steps.push({ id: "accounts", title: "Add an account", text: "Your bank, e-wallet or cash: where the money sits.", href: settingsHref("accounts"), tab: "accounts" });
  }
  if (!f.hasSpendingAccount) {
    steps.push({ id: "spending", title: "Choose your spending account", text: "The account your pay lands in and your bills leave from.", href: settingsHref("accounts"), tab: "accounts" });
  }
  if (!f.hasSavingsAccount) {
    steps.push({ id: "savings", title: "Choose your savings account", text: "Where you put money aside, so the Plan can check it.", href: settingsHref("accounts"), tab: "accounts" });
  }
  if (!f.paydayKnown) {
    steps.push({ id: "payday", title: "Set your payday and pay", text: "Your month runs payday to payday.", href: settingsHref("payday"), tab: "payday" });
  }
  if (!f.hasEntries) {
    steps.push({ id: "entry", title: "Add your first entry", text: "Record a purchase, or import a bank statement.", href: "/" });
  }
  return steps;
}

/** Every step in order, with whether it is done: for drawing the list with its checks. */
export function setupProgress(f: SetupFacts): { step: SetupStep; done: boolean }[] {
  const missing = missingSetupSteps(f);
  const ids = new Set(missing.map((s) => s.id));
  const all = missingSetupSteps({ accountCount: 0, hasSpendingAccount: false, hasSavingsAccount: false, paydayKnown: false, hasEntries: false });
  return all.map((step) => ({ step: missing.find((m) => m.id === step.id) ?? step, done: !ids.has(step.id) }));
}

export const SETUP_SKIP_KEY = "money-tracker:setup-skipped";

/** "Skip for now" lasts a week, then the card comes back if steps are still missing. */
export const SETUP_SKIP_MS = 7 * 24 * 60 * 60 * 1000;

/** Is a stored skip (the time it was tapped, in ms) still in force? Anything unreadable, or from the future, is not. */
export function skipStillActive(raw: string | null | undefined, now: number): boolean {
  const at = Number(raw);
  return Number.isFinite(at) && at > 1_000_000_000_000 && at <= now && now - at < SETUP_SKIP_MS;
}

/** Builds the facts from the rows the pages already load. */
export function setupFacts(p: {
  accounts: { archived: boolean; purpose: "spending" | "savings" | null }[];
  hasSalary: boolean;
  expectedIncome: number;
  hasEntries: boolean;
}): SetupFacts {
  const active = p.accounts.filter((a) => !a.archived);
  return {
    accountCount: active.length,
    hasSpendingAccount: active.some((a) => a.purpose === "spending"),
    hasSavingsAccount: active.some((a) => a.purpose === "savings"),
    paydayKnown: p.hasSalary || p.expectedIncome > 0,
    hasEntries: p.hasEntries,
  };
}
