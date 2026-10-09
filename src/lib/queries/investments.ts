import { and, asc, eq, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accounts, holdings, transactions, valuations } from "@/db/schema";
import type { Account, Holding } from "@/db/schema";
import { mean } from "@/lib/analytics/stats";
import { monthTotals } from "@/lib/analytics/summary";
import { lastMonths, monthEnd, monthStart, shiftMonth, todayISO } from "@/lib/dates";
import { fdDaysToMaturity, fdMaturityValue, fdValueOn, type FdTerms } from "@/lib/investing/fd";
import { xirr, type CashFlow } from "@/lib/investing/xirr";
import type { AdviceInput } from "@/lib/investing/advisor";
import { getSettings } from "@/lib/settings";
import { getAccountBalances } from "./accounts";
import { listFlowRows } from "./analytics";

export type SeriesPoint = { date: string; value: number; contributed: number };

export type InvestmentRow = {
  account: Account;
  holding: Holding | null;
  /** Net money you put in (contributions - withdrawals), sen. */
  invested: number;
  /** Worth today, sen. */
  value: number;
  gain: number;
  /** gain / invested, null when nothing is invested. */
  gainPct: number | null;
  /** Annualised return; null until there's enough history to mean anything. */
  xirr: number | null;
  spanDays: number;
  lastValuedOn: string | null;
  series: SeriesPoint[];
  fd: { maturityDate: string; maturityValue: number; daysToMaturity: number; ratePct: number; matured: boolean } | null;
};

const MS_DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / MS_DAY);

function fdTerms(h: Holding | null): FdTerms | null {
  if (!h || h.product !== "fixed_deposit") return null;
  if (!h.principal || h.annualRatePct == null || !h.startDate || !h.maturityDate) return null;
  return {
    principal: h.principal,
    annualRatePct: h.annualRatePct,
    startDate: h.startDate,
    maturityDate: h.maturityDate,
    compounding: h.compounding ?? "simple",
  };
}

/** Value of a step series at `date`, carrying the last known point forward (0 before the first). */
export function seriesAt(series: SeriesPoint[], date: string): { value: number; contributed: number } {
  let out = { value: 0, contributed: 0 };
  for (const p of series) {
    if (p.date > date) break;
    out = { value: p.value, contributed: p.contributed };
  }
  return out;
}

export async function listInvestments(today: string): Promise<InvestmentRow[]> {
  const db = await getDb();
  const accs = db
    .select()
    .from(accounts)
    .where(eq(accounts.type, "investment"))
    .orderBy(asc(accounts.sortOrder), asc(accounts.id))
    .all()
    .filter((a) => !a.archived);

  const rows: InvestmentRow[] = [];
  for (const account of accs) {
    const holding = db.select().from(holdings).where(eq(holdings.accountId, account.id)).get() ?? null;
    const flowsDb = db
      .select({ date: transactions.date, amount: transactions.amount, from: transactions.accountId, to: transactions.toAccountId })
      .from(transactions)
      .where(and(eq(transactions.type, "transfer"), or(eq(transactions.accountId, account.id), eq(transactions.toAccountId, account.id))))
      .orderBy(asc(transactions.date), asc(transactions.id))
      .all();
    const vals = db.select().from(valuations).where(eq(valuations.accountId, account.id)).orderBy(asc(valuations.date)).all();
    const terms = fdTerms(holding);

    // Contributions (+) and withdrawals (-) as seen from the investment account.
    const flows = flowsDb.map((f) => ({ date: f.date, amount: f.to === account.id ? f.amount : -f.amount }));
    const firstDate = [flows[0]?.date, vals[0]?.date, terms?.startDate].filter(Boolean).sort()[0] ?? today;
    if (account.openingBalance !== 0) flows.unshift({ date: firstDate, amount: account.openingBalance });

    let invested = flows.reduce((s, f) => s + f.amount, 0);
    // An FD's terms are authoritative for how much you put in, even if the transfer wasn't logged.
    if (terms && invested <= 0) invested = terms.principal;

    const lastVal = [...vals].reverse().find((v) => v.date <= today) ?? null;
    const value = terms ? fdValueOn(terms, today) : (lastVal?.value ?? Math.max(0, invested));

    // Value-over-time series: a point on every date something happened, plus today.
    const dates = new Set<string>([today, ...flows.map((f) => f.date), ...vals.map((v) => v.date)]);
    if (terms) {
      // Monthly points across the life of the deposit so far.
      for (let d = terms.startDate, guard = 0; d <= today && guard < 400; guard++) {
        dates.add(d);
        const next = new Date(Date.parse(d) + 30 * MS_DAY).toISOString().slice(0, 10);
        d = next;
      }
    }
    const sorted = [...dates].sort();
    let valIdx = -1;
    const series: SeriesPoint[] = sorted.map((date) => {
      while (valIdx + 1 < vals.length && vals[valIdx + 1].date <= date) valIdx++;
      const contributed = flows.filter((f) => f.date <= date).reduce((s, f) => s + f.amount, 0);
      const effContributed = terms && contributed <= 0 && date >= terms.startDate ? terms.principal : contributed;
      const v = terms ? fdValueOn(terms, date) : valIdx >= 0 ? vals[valIdx].value : Math.max(0, contributed);
      return { date, value: v, contributed: effContributed };
    });

    // XIRR: money in is negative, money out and today's value are positive.
    const cf: CashFlow[] = flows.map((f) => ({ date: f.date, amount: -f.amount }));
    if (terms && cf.length === 0) cf.push({ date: terms.startDate, amount: -terms.principal });
    cf.push({ date: today, amount: value });
    const span = cf.length ? daysBetween([...cf].sort((a, b) => a.date.localeCompare(b.date))[0].date, today) : 0;

    rows.push({
      account,
      holding,
      invested,
      value,
      gain: value - invested,
      gainPct: invested > 0 ? (value - invested) / invested : null,
      xirr: span >= 90 ? xirr(cf) : null,
      spanDays: span,
      lastValuedOn: terms ? today : (lastVal?.date ?? null),
      series,
      fd: terms
        ? {
            maturityDate: terms.maturityDate,
            maturityValue: fdMaturityValue(terms),
            daysToMaturity: fdDaysToMaturity(terms, today),
            ratePct: terms.annualRatePct,
            matured: fdDaysToMaturity(terms, today) <= 0,
          }
        : null,
    });
  }
  return rows;
}

export type NetWorth = { liquid: number; investments: number; total: number };

/** Cash/bank/e-wallet ledger balances + the current value of every investment. */
export async function getNetWorth(today: string): Promise<NetWorth> {
  const [balances, inv] = await Promise.all([getAccountBalances(), listInvestments(today)]);
  const liquid = balances.filter((a) => a.type !== "investment").reduce((s, a) => s + a.balance, 0);
  const investments = inv.reduce((s, r) => s + r.value, 0);
  return { liquid, investments, total: liquid + investments };
}

/** Portfolio-wide series: every holding's value and contributions summed on a shared date axis. */
export function portfolioSeries(rows: InvestmentRow[]): SeriesPoint[] {
  const dates = [...new Set(rows.flatMap((r) => r.series.map((p) => p.date)))].sort();
  return dates.map((date) => {
    let value = 0;
    let contributed = 0;
    for (const r of rows) {
      const p = seriesAt(r.series, date);
      value += p.value;
      contributed += p.contributed;
    }
    return { date, value, contributed };
  });
}

/** Inputs for the advisor: averages over the last (up to) 3 COMPLETE months that contain data. */
export async function getAdviceInput(): Promise<AdviceInput> {
  const today = todayISO();
  const thisMonth = today.slice(0, 7);
  const months = lastMonths(shiftMonth(thisMonth, -1), 3);
  const [rows, balances, settings] = await Promise.all([
    listFlowRows(monthStart(months[0]), monthEnd(months[2])),
    getAccountBalances(),
    getSettings(),
  ]);
  const withData = months.filter((m) => rows.some((r) => r.date.startsWith(m)));
  const totals = withData.map((m) => monthTotals(rows, m));
  return {
    avgMonthlyIncome: Math.round(mean(totals.map((t) => t.income))),
    avgMonthlyExpense: Math.round(mean(totals.map((t) => t.expense))),
    monthsOfData: withData.length,
    liquid: balances.filter((a) => a.type !== "investment").reduce((s, a) => s + a.balance, 0),
    settings,
  };
}
