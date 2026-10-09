import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { DB } from "@/db/open";
import { accounts, categories, recurringBills, transactions } from "@/db/schema";
import type { Account } from "@/db/schema";
import { mean } from "@/lib/analytics/stats";
import { evaluateBills, monthlyCommitments, normalizeName, summarizeBills, type BillDef, type BillInCycle, type BillsSummary, type Commitments } from "@/lib/plan/bills";
import { currentCycle, cycleHistory, normalizeSalaryDates, type Cycle } from "@/lib/plan/cycle";
import { cycleFlow, estimateAllowance, type CycleFlow } from "@/lib/plan/savings-flow";
import { getSettings, type AppSettings } from "@/lib/settings";
import { getAccountBalances } from "./accounts";

export type BillRow = BillDef & {
  categoryName: string | null;
  categoryIcon: string | null;
  accountName: string;
  sortOrder: number;
};

/** Every bill with its category and paying account, in the order you arranged them. Takes the db so non-request code can use it. */
export function selectBills(db: DB): BillRow[] {
  return db
    .select({
      id: recurringBills.id,
      name: recurringBills.name,
      accountId: recurringBills.accountId,
      categoryId: recurringBills.categoryId,
      nature: categories.nature,
      amountMin: recurringBills.amountMin,
      amountMax: recurringBills.amountMax,
      dueDay: recurringBills.dueDay,
      matchKeywords: recurringBills.matchKeywords,
      active: recurringBills.active,
      sortOrder: recurringBills.sortOrder,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      accountName: accounts.name,
    })
    .from(recurringBills)
    .leftJoin(categories, eq(recurringBills.categoryId, categories.id))
    .innerJoin(accounts, eq(recurringBills.accountId, accounts.id))
    .orderBy(asc(recurringBills.sortOrder), asc(recurringBills.id))
    .all()
    .map((b) => ({ ...b, nature: b.nature ?? "need" }));
}

export async function listBills(): Promise<BillRow[]> {
  return selectBills(await getDb());
}

export type RoleAccounts = { spending: Account | null; savings: Account | null };

export async function getRoleAccounts(): Promise<RoleAccounts> {
  const db = await getDb();
  const all = db.select().from(accounts).where(eq(accounts.archived, false)).all();
  return {
    spending: all.find((a) => a.purpose === "spending") ?? null,
    savings: all.find((a) => a.purpose === "savings") ?? null,
  };
}

/** Dates and amounts of every salary you've recorded (income in the "Salary" category). */
export async function listSalaries(): Promise<{ date: string; amount: number }[]> {
  const db = await getDb();
  return db
    .select({ date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.type, "income"), eq(categories.name, "Salary")))
    .orderBy(asc(transactions.date))
    .all();
}

/** Every transaction in a date range, with just the fields the plan maths needs. */
export async function listPlanTxs(from: string, to: string) {
  const db = await getDb();
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      type: transactions.type,
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      item: transactions.item,
      billId: transactions.billId,
      category: categories.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .orderBy(asc(transactions.date), asc(transactions.id))
    .all();
}

export type SafeToSpend = {
  /** Is a "spending" account chosen in Settings? Without one there is nothing to compute. */
  configured: boolean;
  accountName: string | null;
  balance: number;
  /** Money held back for bills not yet paid this cycle. */
  reserve: number;
  /** balance - reserve. Negative means everyday spending will be funded from savings. */
  safe: number;
  perDay: number | null;
  daysLeft: number;
  unpaidCount: number;
  overdueCount: number;
};

export type PlanData = {
  settings: AppSettings;
  today: string;
  cycle: Cycle;
  hasSalary: boolean;
  roles: RoleAccounts;
  bills: (BillInCycle & { categoryName: string | null; categoryIcon: string | null })[];
  summary: BillsSummary;
  commitments: Commitments & { monthlyMax: number };
  safe: SafeToSpend;
  /** Newest first; the first entry is the cycle in progress. Empty until a salary is recorded. */
  flows: CycleFlow[];
  planner: {
    income: number;
    incomeFrom: "salary" | "settings" | "none";
    bills: number;
    allowance: number;
    allowanceFrom: "settings" | "history" | "none";
    buffer: number;
    usualTransfer: number | null;
  };
};

export async function getPlan(today: string): Promise<PlanData> {
  const [settings, allBills, roles, salaries, balances] = await Promise.all([
    getSettings(),
    listBills(),
    getRoleAccounts(),
    listSalaries(),
    getAccountBalances(),
  ]);

  const salaryDates = normalizeSalaryDates(salaries.map((s) => s.date));
  const cycle = currentCycle({ today, salaryDates, paydayDay: settings.paydayDay });
  const history = cycleHistory({ today, salaryDates, paydayDay: settings.paydayDay, max: 7 });

  // One query covers the bill checklist and the savings history.
  const from = history.length ? history[history.length - 1].start : cycle.start;
  const txs = await listPlanTxs(from, today > cycle.end ? today : cycle.end);

  const evalCycle = { start: cycle.start, end: today > cycle.end ? today : cycle.end };
  const evaluated = evaluateBills(allBills, evalCycle, txs, today);
  const byId = new Map(allBills.map((b) => [b.id, b]));
  const bills = evaluated.map((e) => ({
    ...e,
    categoryName: byId.get(e.bill.id)?.categoryName ?? null,
    categoryIcon: byId.get(e.bill.id)?.categoryIcon ?? null,
  }));
  const summary = summarizeBills(evaluated);
  const commitments = {
    ...monthlyCommitments(allBills),
    monthlyMax: allBills.filter((b) => b.active).reduce((s, b) => s + b.amountMax, 0),
  };

  // Safe to spend: what's in the spending account minus the bills it still has to pay this cycle.
  let safe: SafeToSpend = {
    configured: false,
    accountName: null,
    balance: 0,
    reserve: 0,
    safe: 0,
    perDay: null,
    daysLeft: cycle.daysLeft,
    unpaidCount: 0,
    overdueCount: 0,
  };
  if (roles.spending) {
    const spendingId = roles.spending.id;
    const own = evaluated.filter((e) => e.bill.accountId === spendingId);
    const balance = balances.find((a) => a.id === spendingId)?.balance ?? 0;
    const reserve = own.reduce((s, e) => s + e.reserve, 0);
    const left = balance - reserve;
    safe = {
      configured: true,
      accountName: roles.spending.name,
      balance,
      reserve,
      safe: left,
      perDay: cycle.daysLeft > 0 ? Math.round(left / cycle.daysLeft) : null,
      daysLeft: cycle.daysLeft,
      unpaidCount: own.filter((e) => e.status !== "paid").length,
      overdueCount: own.filter((e) => e.status === "overdue").length,
    };
  }

  const ctx = {
    spendingId: roles.spending?.id ?? null,
    savingsId: roles.savings?.id ?? null,
    billNames: new Set(allBills.map((b) => normalizeName(b.name))),
  };
  const flows = history.map((range) => cycleFlow(range, txs, ctx));

  const lastSalary = salaries[salaries.length - 1]?.amount ?? 0;
  const income = lastSalary || settings.expectedIncome;
  const allowance = settings.variableAllowance || estimateAllowance(flows) || 0;
  // What you move at payday, from the last few cycles (the one in progress counts once its payday move has happened).
  // One-off transfers later in a cycle - say, a final payslip - are ignored, so they don't inflate "what you usually move".
  const deposits = flows.filter((f) => f.paydayDeposit > 0).slice(0, 3).map((f) => f.paydayDeposit);

  return {
    settings,
    today,
    cycle,
    hasSalary: salaryDates.length > 0,
    roles,
    bills,
    summary,
    commitments,
    safe,
    flows,
    planner: {
      income,
      incomeFrom: lastSalary ? "salary" : settings.expectedIncome ? "settings" : "none",
      bills: commitments.monthlyMax,
      allowance,
      allowanceFrom: settings.variableAllowance ? "settings" : allowance ? "history" : "none",
      buffer: settings.cycleBuffer,
      usualTransfer: deposits.length ? Math.round(mean(deposits)) : null,
    },
  };
}
