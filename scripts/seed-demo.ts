/**
 * Builds a throwaway DEMO database (~4 months of realistic MYR life) with leaks planted on purpose:
 *   - a daily Starbucks latte (small-but-frequent)
 *   - a gym membership + an old streaming app nobody uses (forgotten subscriptions)
 *   - Eating Out creeping up in the current month
 *   - a big Shopee haul this month (category spike)
 *   - cash withdrawn from the ATM but only partly recorded (untracked cash)
 *
 *   pnpm run seed:demo                -> data/demo.db
 *   DB_PATH=data/demo.db pnpm dev     -> look at it
 *
 * Refuses to touch any database whose file name doesn't contain "demo" or "test".
 */
import { eq, sql } from "drizzle-orm";
import { addDays, addMonths, format, getDay, startOfMonth } from "date-fns";
import path from "node:path";
import { openDb } from "../src/db/open";
import { accounts, categories, holdings, settings, transactions, valuations } from "../src/db/schema";
import { seedIfEmpty } from "../src/db/seed";

const file = path.resolve(process.env.DB_PATH ?? "data/demo.db");
if (!/(demo|test)/i.test(path.basename(file))) {
  console.error(`Refusing to seed "${file}": the file name must contain "demo" or "test" so real data is never overwritten.`);
  process.exit(1);
}

const db = openDb(file);

// Wipe in place (not by deleting the file): Windows won't delete a database the dev server has open.
db.transaction((tx) => {
  tx.delete(valuations).run();
  tx.delete(holdings).run();
  tx.delete(transactions).run();
  tx.delete(accounts).run();
  tx.delete(categories).run();
  tx.delete(settings).run();
  tx.run(sql`delete from sqlite_sequence`);
});
seedIfEmpty(db);

// Deterministic randomness so the demo is reproducible.
let seed = 42;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const chance = (p: number) => rand() < p;
const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

const today = new Date();
const start = startOfMonth(addMonths(today, -4));
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const curMonth = format(today, "yyyy-MM");

// --- lookups -----------------------------------------------------------------
const acc = new Map(db.select().from(accounts).all().map((a) => [a.name, a.id]));
const cat = new Map(db.select().from(categories).all().map((c) => [c.name, c.id]));
const A = (n: string) => acc.get(n) ?? (() => { throw new Error(`no account ${n}`); })();
const C = (n: string) => cat.get(n) ?? (() => { throw new Error(`no category ${n}`); })();

// Opening balances (what each account held on the first day of the demo).
db.update(accounts).set({ openingBalance: 2_000_000 }).where(eq(accounts.id, A("Bank Account"))).run(); // RM 20,000
db.update(accounts).set({ openingBalance: 25_000 }).where(eq(accounts.id, A("Cash in Hand"))).run();
db.update(accounts).set({ openingBalance: 8_000 }).where(eq(accounts.id, A("e-Wallet"))).run();

const sp = db.insert(accounts).values({ name: "S&P 500 ETF (Moomoo)", type: "investment", sortOrder: 10 }).returning().get();
const fd = db.insert(accounts).values({ name: "Maybank FD 12M", type: "investment", sortOrder: 11 }).returning().get();

const rows: (typeof transactions.$inferInsert)[] = [];
type Add = { date: string; amount: number; account: string; category: string; item: string; type?: "income" | "expense" };
const add = ({ date, amount, account, category, item, type = "expense" }: Add) =>
  rows.push({ date, type, amount: Math.round(amount * 100), accountId: A(account), categoryId: C(category), item });
const move = (date: string, amount: number, from: number, to: number, note?: string) =>
  rows.push({ date, type: "transfer", amount: Math.round(amount * 100), accountId: from, toAccountId: to, note });

// --- the loop ----------------------------------------------------------------
let cashDays = 0;
let ewalletDays = 0;
let spValue = 0;
const spSnapshots: { date: string; value: number }[] = [];

for (let d = start; d <= today; d = addDays(d, 1)) {
  const date = iso(d);
  const dom = d.getDate();
  const dow = getDay(d); // 0 Sun .. 6 Sat
  const month = format(d, "yyyy-MM");
  const inCurrent = month === curMonth;
  const weekday = dow >= 1 && dow <= 5;

  // Income
  if (dom === 1) add({ date, amount: 6500, account: "Bank Account", category: "Salary", item: "Monthly salary", type: "income" });
  if (dom === 18 && chance(0.5)) add({ date, amount: round2(between(250, 600)), account: "Bank Account", category: "Side Income", item: "Freelance job", type: "income" });

  // Fixed bills (bank)
  if (dom === 1) add({ date, amount: 1200, account: "Bank Account", category: "Rent / Housing", item: "Rent" });
  if (dom === 3) add({ date, amount: 129, account: "Bank Account", category: "Subscriptions", item: "Gym membership" });
  if (dom === 5) add({ date, amount: 650, account: "Bank Account", category: "Loans & Insurance", item: "Car loan" });
  if (dom === 8) {
    add({ date, amount: 55.9, account: "Bank Account", category: "Subscriptions", item: "Netflix" });
    add({ date, amount: 16.9, account: "Bank Account", category: "Subscriptions", item: "Spotify" });
  }
  if (dom === 10) add({ date, amount: 129, account: "Bank Account", category: "Bills & Utilities", item: "Unifi internet" });
  if (dom === 12) add({ date, amount: 68, account: "Bank Account", category: "Bills & Utilities", item: "Celcom postpaid" });
  if (dom === 14) add({ date, amount: 12.9, account: "Bank Account", category: "Subscriptions", item: "Cloud storage" });
  if (dom === 15) add({ date, amount: round2(between(75, 125)), account: "Bank Account", category: "Bills & Utilities", item: "TNB electricity" });
  if (dom === 20) add({ date, amount: 180, account: "Bank Account", category: "Loans & Insurance", item: "Insurance premium" });
  if (dom === 22) add({ date, amount: 29.9, account: "Bank Account", category: "Subscriptions", item: "Viu Premium" }); // forgotten
  if (dom === 29) add({ date, amount: 300, account: "Bank Account", category: "Family & Kids", item: "Parents allowance" });

  // Cash and e-wallet top-ups (transfers, not spending)
  if (++cashDays === 12) { move(date, 200, A("Bank Account"), A("Cash in Hand"), "ATM withdrawal"); cashDays = 0; }
  if (++ewalletDays === 9) { move(date, 280, A("Bank Account"), A("e-Wallet"), "e-Wallet top-up"); ewalletDays = 0; }

  // Daily habits
  if (weekday) {
    // Lunch: the Eating Out category creeps up this month.
    const lunchPrice = round2(between(10, 16) * (inCurrent ? 1.4 : 1));
    add({ date, amount: lunchPrice, account: chance(0.7) ? "Cash in Hand" : "e-Wallet", category: "Eating Out", item: pick(["Nasi campur", "Chicken rice", "Mixed rice"]) });
    if (chance(0.85)) add({ date, amount: 2.5, account: "Cash in Hand", category: "Eating Out", item: "Teh tarik" });
    // The daily latte nobody counts.
    if (chance(0.7)) add({ date, amount: round2(between(13.5, 15.5)), account: "e-Wallet", category: "Eating Out", item: "Starbucks latte" });
    if (chance(0.4)) add({ date, amount: round2(between(8, 18)), account: "e-Wallet", category: "Transport & Fuel", item: "Parking" });
  }
  if (dow === 6) {
    add({ date, amount: round2(between(85, 160)), account: "Bank Account", category: "Groceries", item: pick(["Jaya Grocer", "Giant groceries"]) });
    add({ date, amount: round2(between(35, 80)), account: "Bank Account", category: "Eating Out", item: "Dinner with friends" });
  }
  if (dow === 0) {
    add({ date, amount: round2(between(55, 70)), account: "Bank Account", category: "Transport & Fuel", item: "Petrol RON95" });
    if (chance(0.5)) add({ date, amount: round2(between(12, 22)), account: "e-Wallet", category: "Transport & Fuel", item: "Touch 'n Go reload" });
  }
  if ((dow === 2 || dow === 4) && chance(inCurrent ? 0.8 : 0.45)) {
    add({ date, amount: round2(between(24, 42)), account: "e-Wallet", category: "Eating Out", item: "GrabFood" });
  }
  if (chance(0.22)) add({ date, amount: round2(between(12, 30)), account: "Cash in Hand", category: "Groceries", item: "99 Speedmart" });
  if (dom === 21) add({ date, amount: 36, account: "e-Wallet", category: "Entertainment", item: "Cinema" });
  if (chance(0.03)) add({ date, amount: round2(between(25, 70)), account: "Bank Account", category: "Health", item: "Pharmacy" });
  if (chance(0.05) && !inCurrent) add({ date, amount: round2(between(40, 120)), account: "e-Wallet", category: "Shopping", item: "Shopee order" });
  if (inCurrent && dom === 4) add({ date, amount: 389.9, account: "e-Wallet", category: "Shopping", item: "Shopee haul" });

  // Investing: RM 600 into the S&P 500 account on the 29th.
  if (dom === 29) {
    move(date, 600, A("Bank Account"), sp.id, "Monthly S&P 500 DCA");
    spValue += 600;
  }
  // The FD is opened on the 3rd of the first month.
  if (date === iso(addDays(start, 2))) move(date, 10_000, A("Bank Account"), fd.id, "Open FD");

  // Month-end (and today) valuation of the S&P account, drifting ~+0.9% a month.
  const isLastDay = addDays(d, 1).getMonth() !== d.getMonth();
  if ((isLastDay || date === iso(today)) && spValue > 0) {
    spValue = spValue * (1 + between(-0.015, 0.035));
    spSnapshots.push({ date, value: Math.round(spValue * 100) });
  }
}

db.transaction((tx) => {
  for (let i = 0; i < rows.length; i += 200) tx.insert(transactions).values(rows.slice(i, i + 200)).run();
  tx.insert(holdings).values({ accountId: sp.id, product: "sp500_etf", ticker: "VOO", priceCurrency: "USD" }).run();
  tx.insert(holdings)
    .values({
      accountId: fd.id,
      product: "fixed_deposit",
      principal: 1_000_000,
      annualRatePct: 3.05,
      startDate: iso(addDays(start, 2)),
      maturityDate: iso(addMonths(addDays(start, 2), 12)),
      compounding: "simple",
    })
    .run();
  for (const s of spSnapshots) tx.insert(valuations).values({ accountId: sp.id, date: s.date, value: s.value, source: "manual" }).onConflictDoNothing().run();
});

const n = db.select().from(transactions).all().length;
console.log(`Demo database written to ${file}: ${n} transactions, ${spSnapshots.length} valuation snapshots.`);
console.log(`View it with:  $env:DB_PATH="${path.relative(process.cwd(), file)}"; pnpm dev`);
