import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * All money columns are INTEGER sen (RM 12.50 -> 1250). Never floats.
 * All dates are local calendar dates stored as 'YYYY-MM-DD' text.
 */

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // An investment is just an account: contributing to it is a transfer.
  type: text("type", { enum: ["bank", "cash", "ewallet", "investment"] }).notNull(),
  openingBalance: integer("opening_balance").notNull().default(0),
  // Which job this account does in the payday routine. At most one account holds each role.
  //   spending: where salary lands and bills are paid from
  //   savings:  the emergency fund / money set aside
  purpose: text("purpose", { enum: ["spending", "savings"] }),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  // Used for the 50/30/20 analysis.
  nature: text("nature", { enum: ["need", "want", "saving"] }).notNull().default("want"),
  color: text("color").notNull().default("#64748b"),
  icon: text("icon").notNull().default("•"),
  monthlyBudget: integer("monthly_budget"), // sen, nullable
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    type: text("type", { enum: ["income", "expense", "transfer"] }).notNull(),
    amount: integer("amount").notNull(), // always positive sen
    // Source account (for transfers: the account money leaves).
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    // Destination account, transfers only.
    toAccountId: integer("to_account_id").references(() => accounts.id),
    categoryId: integer("category_id").references(() => categories.id),
    // The specific thing bought, e.g. "teh tarik", "Netflix".
    item: text("item"),
    merchant: text("merchant"),
    note: text("note"),
    // The recurring bill this payment settles, if any.
    billId: integer("bill_id").references(() => recurringBills.id),
    // Money received from someone who shares a bill with you (their payment towards it). See bill_shares.
    shareId: integer("share_id").references(() => billShares.id),
    // Fingerprint of the bank-statement row this came from; lets a re-import skip what is already here.
    importKey: text("import_key"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("tx_date_idx").on(t.date),
    index("tx_import_key_idx").on(t.accountId, t.importKey),
    index("tx_category_date_idx").on(t.categoryId, t.date),
    index("tx_account_idx").on(t.accountId),
    index("tx_item_idx").on(t.item),
  ],
);

/** Extra facts for accounts of type 'investment' (1:1). */
export const holdings = sqliteTable("holdings", {
  accountId: integer("account_id")
    .primaryKey()
    .references(() => accounts.id),
  product: text("product", {
    enum: ["sp500_etf", "fixed_deposit", "asb", "other"],
  }).notNull(),
  ticker: text("ticker"), // Yahoo Finance symbol for the optional price fetch, e.g. "VOO"
  priceCurrency: text("price_currency").notNull().default("USD"), // currency the ticker is quoted in
  units: real("units"),
  // Fixed deposit terms
  principal: integer("principal"), // sen
  annualRatePct: real("annual_rate_pct"),
  startDate: text("start_date"),
  maturityDate: text("maturity_date"),
  compounding: text("compounding", {
    enum: ["simple", "monthly", "quarterly", "annually"],
  }),
});

/** Point-in-time value snapshots of an investment account. */
export const valuations = sqliteTable(
  "valuations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    date: text("date").notNull(),
    value: integer("value").notNull(), // sen
    source: text("source", { enum: ["manual", "price", "fd"] }).notNull().default("manual"),
  },
  (t) => [uniqueIndex("valuation_account_date_idx").on(t.accountId, t.date)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * A payment that repeats every month: rent, insurance, subscriptions...
 * Amounts are a range because some bills vary (rent 950-980, electricity 65-75); fixed bills have min = max.
 */
export const recurringBills = sqliteTable("recurring_bills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  // The account it is paid from.
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  amountMin: integer("amount_min").notNull(),
  amountMax: integer("amount_max").notNull(),
  // Day of the month it falls due (1-31). Null = not known yet; the bill still counts as unpaid until paid.
  dueDay: integer("due_day"),
  // Comma-separated lowercase words that identify this bill on a bank statement.
  matchKeywords: text("match_keywords"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  // How a shared bill is split. 'monthly': everyone owes an equal part of every month (Netflix). 'turns': ONE person pays
  // the whole bill each month, in rotation, with you taking some months yourself (Spotify); see bill_turns.
  sharing: text("sharing", { enum: ["monthly", "turns"] }).notNull().default("monthly"),
});

/**
 * Someone who splits a recurring bill with you (Netflix among 4, Spotify among 6). Each person owes `share` for every
 * month the bill is charged from `startMonth` on; whatever they send you (income entries carrying their id) is applied
 * to the oldest unpaid month first, so a lump sum for three months and a single month both just work.
 */
export const billShares = sqliteTable("bill_shares", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  billId: integer("bill_id")
    .notNull()
    .references(() => recurringBills.id),
  name: text("name").notNull(),
  // What they owe per month, in sen.
  share: integer("share").notNull(),
  // First month they take part: 'YYYY-MM'.
  startMonth: text("start_month").notNull(),
  // Last month they take part, if they have left the plan ('YYYY-MM'); null = still sharing.
  endMonth: text("end_month"),
  // Comma-separated lowercase words that identify them on a bank line when they pay you (a surname, a nickname).
  matchKeywords: text("match_keywords"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * Whose turn it is to pay a 'turns' bill, month by month. One row per month: the person who covers the WHOLE bill that
 * month, or null when it is you. A person's payment settles their own turn, not "six months": Spotify is paid by one
 * person a month, each of the five once per six-month cycle, and you take the first month of every cycle.
 */
export const billTurns = sqliteTable(
  "bill_turns",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    billId: integer("bill_id")
      .notNull()
      .references(() => recurringBills.id),
    // 'YYYY-MM'
    month: text("month").notNull(),
    // The person covering it; null = you.
    shareId: integer("share_id").references(() => billShares.id),
  },
  (t) => [uniqueIndex("bill_turn_month_idx").on(t.billId, t.month)],
);

/** "Remember this": a statement description pattern -> how to record it. Learned during import review. */
export const importRules = sqliteTable(
  "import_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pattern: text("pattern").notNull(), // lowercase; matches when the description contains it
    kind: text("kind", { enum: ["expense", "income", "transfer"] }).notNull(),
    categoryId: integer("category_id").references(() => categories.id),
    item: text("item"),
    billId: integer("bill_id").references(() => recurringBills.id),
    transferAccountId: integer("transfer_account_id").references(() => accounts.id),
  },
  (t) => [uniqueIndex("import_rule_pattern_idx").on(t.pattern)],
);

export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type Valuation = typeof valuations.$inferSelect;
export type RecurringBill = typeof recurringBills.$inferSelect;
export type ImportRule = typeof importRules.$inferSelect;
