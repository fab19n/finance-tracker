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
});

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
