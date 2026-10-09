"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { accounts, holdings, transactions, valuations } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { fetchFxToMyr, fetchQuote, holdingValueSen } from "@/lib/investing/prices";
import { parseSen } from "@/lib/money";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

function done(error?: string, extra = ""): never {
  revalidatePath("/", "layout");
  const q = new URLSearchParams();
  if (error) q.set("error", error);
  const s = q.toString();
  redirect(`/invest${s ? `?${s}` : ""}${extra}`);
}

const AddInput = z.object({
  product: z.enum(["sp500_etf", "fixed_deposit", "asb", "other"]),
  name: z.string().trim().min(1, "Give the investment a name").max(60),
  ticker: z.string().trim().max(20).optional(),
  units: z.string().optional(),
  priceCurrency: z.string().trim().max(5).optional(),
  amount: z.string().optional(),
  fromAccountId: z.string().optional(),
  date: DATE,
  annualRatePct: z.string().optional(),
  maturityDate: z.string().optional(),
  compounding: z.enum(["simple", "monthly", "quarterly", "annually"]).optional(),
  recordTransfer: z.string().optional(),
});

/** Create an investment (an account of type 'investment' + its holding details) and optionally the funding transfer. */
export async function addInvestment(formData: FormData): Promise<void> {
  const p = AddInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(p.error.issues[0]?.message ?? "Check the form");
  const v = p.data!;

  const amount = v.amount?.trim() ? parseSen(v.amount) : 0;
  if (amount === null) done("The amount isn't valid");
  const isFd = v.product === "fixed_deposit";

  let rate: number | null = null;
  if (isFd) {
    if (!amount || amount <= 0) done("A fixed deposit needs the principal amount");
    rate = Number(v.annualRatePct);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 30) done("Enter the FD's interest rate, e.g. 3.05");
    if (!v.maturityDate || !/^\d{4}-\d{2}-\d{2}$/.test(v.maturityDate) || v.maturityDate <= v.date) {
      done("The maturity date must be after the start date");
    }
  }
  const units = v.units?.trim() ? Number(v.units) : null;
  if (units !== null && (!Number.isFinite(units) || units <= 0)) done("Units must be a positive number");

  const db = await getDb();
  const acc = db
    .insert(accounts)
    .values({ name: v.name, type: "investment", openingBalance: 0, sortOrder: 50 })
    .returning()
    .get();

  db.insert(holdings)
    .values({
      accountId: acc.id,
      product: v.product,
      ticker: v.ticker?.trim() || null,
      units,
      priceCurrency: v.priceCurrency?.trim() || "USD",
      principal: isFd ? amount : null,
      annualRatePct: isFd ? rate : null,
      startDate: isFd ? v.date : null,
      maturityDate: isFd ? v.maturityDate : null,
      compounding: isFd ? (v.compounding ?? "simple") : null,
    })
    .run();

  // Record the money leaving your bank, so balances and net worth stay honest.
  const from = Number(v.fromAccountId);
  if (amount && amount > 0 && from && v.recordTransfer) {
    db.insert(transactions)
      .values({
        date: v.date,
        type: "transfer",
        amount,
        accountId: from,
        toAccountId: acc.id,
        note: isFd ? `Open ${v.name}` : `Initial investment in ${v.name}`,
      })
      .run();
  }
  done();
}

const ValuationInput = z.object({
  accountId: z.string().min(1),
  value: z.string(),
  date: DATE,
});

/** Record what an investment is worth on a date (one value per day; re-entering overwrites). */
export async function recordValuation(formData: FormData): Promise<void> {
  const p = ValuationInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(p.error.issues[0]?.message);
  const value = parseSen(p.data!.value);
  if (value === null) done("Enter the current value, e.g. 12500.00");
  const db = await getDb();
  db.insert(valuations)
    .values({ accountId: Number(p.data!.accountId), date: p.data!.date, value: value!, source: "manual" })
    .onConflictDoUpdate({ target: [valuations.accountId, valuations.date], set: { value: value!, source: "manual" } })
    .run();
  done();
}

const FlowInput = z.object({
  accountId: z.string().min(1),
  fromAccountId: z.string().min(1, "Pick the account the money comes from"),
  amount: z.string(),
  date: DATE,
  direction: z.enum(["in", "out"]),
});

/** Add money to (or take money out of) an investment: recorded as a transfer, never as spending. */
export async function recordInvestmentFlow(formData: FormData): Promise<void> {
  const p = FlowInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done(p.error.issues[0]?.message);
  const amount = parseSen(p.data!.amount);
  if (amount === null || amount <= 0) done("Enter an amount greater than 0");
  const inv = Number(p.data!.accountId);
  const other = Number(p.data!.fromAccountId);
  const db = await getDb();
  db.insert(transactions)
    .values({
      date: p.data!.date,
      type: "transfer",
      amount: amount!,
      accountId: p.data!.direction === "in" ? other : inv,
      toAccountId: p.data!.direction === "in" ? inv : other,
      note: p.data!.direction === "in" ? "Investment contribution" : "Investment withdrawal",
    })
    .run();
  done();
}

export async function archiveInvestment(formData: FormData): Promise<void> {
  const id = Number(formData.get("accountId"));
  const db = await getDb();
  db.update(accounts).set({ archived: true }).where(eq(accounts.id, id)).run();
  done();
}

/** Fetch live prices for every holding that has a ticker and units, and store today's value. */
export async function refreshPrices(): Promise<void> {
  const db = await getDb();
  const rows = db.select().from(holdings).all().filter((h) => h.ticker && h.units && h.product !== "fixed_deposit");
  if (rows.length === 0) done("Add a ticker and the number of units to a holding first");

  const today = todayISO();
  const fxCache = new Map<string, number>();
  let ok = 0;
  const problems: string[] = [];
  for (const h of rows) {
    try {
      const quote = await fetchQuote(h.ticker!);
      if (!fxCache.has(quote.currency)) fxCache.set(quote.currency, await fetchFxToMyr(quote.currency));
      const value = holdingValueSen(h.units!, quote, fxCache.get(quote.currency)!);
      db.insert(valuations)
        .values({ accountId: h.accountId, date: today, value, source: "price" })
        .onConflictDoUpdate({ target: [valuations.accountId, valuations.date], set: { value, source: "price" } })
        .run();
      ok++;
    } catch (e) {
      problems.push(`${h.ticker}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  revalidatePath("/", "layout");
  const q = new URLSearchParams({ priced: String(ok) });
  if (problems.length) q.set("error", problems.join(" · ") + " - you can still update the value by hand.");
  redirect(`/invest?${q.toString()}`);
}

const HoldingInput = z.object({
  accountId: z.string().min(1),
  ticker: z.string().trim().max(20).optional(),
  units: z.string().optional(),
  priceCurrency: z.string().trim().max(5).optional(),
});

/** Set the ticker / units that power "Refresh prices" for a holding. */
export async function updateHolding(formData: FormData): Promise<void> {
  const p = HoldingInput.safeParse(Object.fromEntries(formData));
  if (!p.success) done("Check the ticker and units");
  const units = p.data!.units?.trim() ? Number(p.data!.units) : null;
  if (units !== null && (!Number.isFinite(units) || units <= 0)) done("Units must be a positive number");
  const db = await getDb();
  db.update(holdings)
    .set({ ticker: p.data!.ticker?.trim() || null, units, priceCurrency: p.data!.priceCurrency?.trim() || "USD" })
    .where(eq(holdings.accountId, Number(p.data!.accountId)))
    .run();
  done();
}
