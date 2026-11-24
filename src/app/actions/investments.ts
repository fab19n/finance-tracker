"use server";

import { eq, min, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { accounts, holdings, transactions, valuations } from "@/db/schema";
import type { DB } from "@/db/open";
import { isRealDate, todayISO } from "@/lib/dates";
import { fetchFxToMyr, fetchQuote, holdingValueSen } from "@/lib/investing/prices";
import { MAX_AMOUNT_MESSAGE, withinLimit } from "@/lib/limits";
import { parseSen } from "@/lib/money";
import { savedParams, type SavedKey } from "@/lib/saved-notice";

const DATE = z.string().refine((s) => isRealDate(s), "Pick a valid date");
const MAX_UNITS = 1_000_000_000_000;

/** The account behind an id from a form, or nothing when it doesn't exist. */
function accountById(db: DB, raw: unknown) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? db.select().from(accounts).where(eq(accounts.id, id)).get() : undefined;
}

function done(error?: string, saved?: SavedKey): never {
  revalidatePath("/", "layout");
  const q = new URLSearchParams();
  if (error) q.set("error", error);
  else if (saved) for (const [k, v] of Object.entries(savedParams(saved))) if (v) q.set(k, v);
  const s = q.toString();
  redirect(`/invest${s ? `?${s}` : ""}`);
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
  if (!withinLimit(amount!)) done(MAX_AMOUNT_MESSAGE);
  const isFd = v.product === "fixed_deposit";

  let rate: number | null = null;
  if (isFd) {
    if (!amount || amount <= 0) done("A fixed deposit needs the principal amount");
    rate = Number(v.annualRatePct);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 30) done("Enter the FD's interest rate, e.g. 3.05");
    if (!v.maturityDate || !isRealDate(v.maturityDate) || v.maturityDate <= v.date) {
      done("The maturity date must be after the start date");
    }
  }
  const units = v.units?.trim() ? Number(v.units) : null;
  if (units !== null && (!Number.isFinite(units) || units <= 0 || units > MAX_UNITS)) done("Units must be a positive number");

  const db = await getDb();
  // The funding account is checked BEFORE anything is created, so a bad id leaves nothing half made.
  const from = Number(v.fromAccountId);
  const funding = amount! > 0 && from && v.recordTransfer;
  if (funding) {
    const source = accountById(db, from);
    if (!source) done("The account the money comes from no longer exists");
    if (source!.type === "investment") done("Fund an investment from a bank, cash or e-wallet account, not from another investment");
    // A transfer dated before the account's first entry would take money out of a balance that did not hold it yet.
    const first = db
      .select({ date: min(transactions.date) })
      .from(transactions)
      .where(or(eq(transactions.accountId, from), eq(transactions.toAccountId, from)))
      .get()?.date;
    if (first && v.date < first) {
      done(`${source!.name} has no entries before ${first}, so a transfer out on ${v.date} would take money it did not hold yet. Pick a date on or after ${first}, or untick "Also record the transfer" (the investment is still added).`);
    }
  }

  db.transaction((tx) => {
    const acc = tx
      .insert(accounts)
      .values({ name: v.name, type: "investment", openingBalance: 0, sortOrder: 50 })
      .returning()
      .get();

    tx.insert(holdings)
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
    if (funding) {
      tx.insert(transactions)
        .values({
          date: v.date,
          type: "transfer",
          amount: amount!,
          accountId: from,
          toAccountId: acc.id,
          note: isFd ? `Open ${v.name}` : `Initial investment in ${v.name}`,
        })
        .run();
    }
  });
  done(undefined, "investmentAdded");
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
  if (!withinLimit(value!)) done(MAX_AMOUNT_MESSAGE);
  const db = await getDb();
  const inv = accountById(db, p.data!.accountId);
  if (!inv || inv.type !== "investment") done("That isn't an investment account");
  db.insert(valuations)
    .values({ accountId: inv!.id, date: p.data!.date, value: value!, source: "manual" })
    .onConflictDoUpdate({ target: [valuations.accountId, valuations.date], set: { value: value!, source: "manual" } })
    .run();
  done(undefined, "value");
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
  if (!withinLimit(amount!)) done(MAX_AMOUNT_MESSAGE);
  const db = await getDb();
  const invAcc = accountById(db, p.data!.accountId);
  if (!invAcc || invAcc.type !== "investment") done("That isn't an investment account");
  const otherAcc = accountById(db, p.data!.fromAccountId);
  if (!otherAcc) done("The account on the other side no longer exists");
  if (otherAcc!.type === "investment") done("Move money between an investment and a bank, cash or e-wallet account");
  const inv = invAcc!.id;
  const other = otherAcc!.id;
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
  done(undefined, "flow");
}

export async function archiveInvestment(formData: FormData): Promise<void> {
  const db = await getDb();
  const acc = accountById(db, formData.get("accountId"));
  if (!acc || acc.type !== "investment") done("That isn't an investment account");
  const id = acc!.id;
  db.update(accounts).set({ archived: true }).where(eq(accounts.id, id)).run();
  done(undefined, "investmentArchived");
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
  if (units !== null && (!Number.isFinite(units) || units <= 0 || units > MAX_UNITS)) done("Units must be a positive number");
  const db = await getDb();
  const inv = accountById(db, p.data!.accountId);
  if (!inv || inv.type !== "investment") done("That isn't an investment account");
  db.update(holdings)
    .set({ ticker: p.data!.ticker?.trim() || null, units, priceCurrency: p.data!.priceCurrency?.trim() || "USD" })
    .where(eq(holdings.accountId, inv!.id))
    .run();
  done(undefined, "holding");
}
