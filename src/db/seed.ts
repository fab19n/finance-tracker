import { count } from "drizzle-orm";
import type { DB } from "./open";
import { accounts, categories } from "./schema";

type CatSeed = {
  name: string;
  type: "income" | "expense";
  nature: "need" | "want" | "saving";
  color: string;
  icon: string;
  isSystem?: boolean;
};

export const SYSTEM_UNACCOUNTED = "Unaccounted cash";
export const SYSTEM_CASH_ADJUSTMENT = "Cash adjustment";

const EXPENSE: CatSeed[] = [
  { name: "Groceries", type: "expense", nature: "need", color: "#16a34a", icon: "🛒" },
  { name: "Eating Out", type: "expense", nature: "want", color: "#f97316", icon: "🍜" },
  { name: "Transport & Fuel", type: "expense", nature: "need", color: "#2563eb", icon: "⛽" },
  { name: "Bills & Utilities", type: "expense", nature: "need", color: "#0891b2", icon: "💡" },
  { name: "Rent / Housing", type: "expense", nature: "need", color: "#7c3aed", icon: "🏠" },
  { name: "Loans & Insurance", type: "expense", nature: "need", color: "#4f46e5", icon: "🏦" },
  { name: "Health", type: "expense", nature: "need", color: "#dc2626", icon: "💊" },
  { name: "Family & Kids", type: "expense", nature: "need", color: "#db2777", icon: "👨‍👩‍👧" },
  { name: "Education", type: "expense", nature: "need", color: "#0d9488", icon: "📚" },
  { name: "Shopping", type: "expense", nature: "want", color: "#c026d3", icon: "🛍️" },
  // Phones, computers, parts: big, occasional purchases that would otherwise swamp everyday shopping.
  { name: "IT & Gadgets", type: "expense", nature: "want", color: "#6366f1", icon: "💻" },
  { name: "Entertainment", type: "expense", nature: "want", color: "#e11d48", icon: "🎬" },
  { name: "Subscriptions", type: "expense", nature: "want", color: "#9333ea", icon: "🔁" },
  { name: "Personal Care", type: "expense", nature: "want", color: "#ca8a04", icon: "💈" },
  // Reloading GrabPay / ShopeePay / Boost: spent inside a wallet this app doesn't see, so the top-up is the spending.
  { name: "E-wallet top-up", type: "expense", nature: "want", color: "#0ea5e9", icon: "👛" },
  { name: "Gifts & Donations", type: "expense", nature: "want", color: "#ea580c", icon: "🎁" },
  { name: "Travel", type: "expense", nature: "want", color: "#0284c7", icon: "✈️" },
  { name: "Miscellaneous", type: "expense", nature: "want", color: "#64748b", icon: "📦" },
  {
    name: SYSTEM_UNACCOUNTED,
    type: "expense",
    nature: "want",
    color: "#475569",
    icon: "❓",
    isSystem: true,
  },
];

const INCOME: CatSeed[] = [
  { name: "Salary", type: "income", nature: "saving", color: "#059669", icon: "💼" },
  { name: "Side Income", type: "income", nature: "saving", color: "#10b981", icon: "🛠️" },
  { name: "Bonus", type: "income", nature: "saving", color: "#14b8a6", icon: "🎉" },
  { name: "Gift Received", type: "income", nature: "saving", color: "#22c55e", icon: "🎁" },
  // Friends and family paying you back (a shared subscription, a dinner they owed): money in, but neither earnings nor a gift.
  { name: "Reimbursements", type: "income", nature: "saving", color: "#4ade80", icon: "🤝" },
  { name: "Investment Income", type: "income", nature: "saving", color: "#65a30d", icon: "📈" },
  { name: "Other Income", type: "income", nature: "saving", color: "#84cc16", icon: "➕" },
  {
    name: SYSTEM_CASH_ADJUSTMENT,
    type: "income",
    nature: "saving",
    color: "#475569",
    icon: "⚖️",
    isSystem: true,
  },
];

/** Insert default accounts and categories on a brand-new database. Idempotent. */
export function seedIfEmpty(db: DB): void {
  const [{ n: catCount }] = db.select({ n: count() }).from(categories).all();
  if (catCount === 0) {
    db.insert(categories)
      .values([...EXPENSE, ...INCOME].map((c, i) => ({ ...c, sortOrder: i })))
      .run();
  }
  const [{ n: accCount }] = db.select({ n: count() }).from(accounts).all();
  if (accCount === 0) {
    db.insert(accounts)
      .values([
        { name: "Bank Account", type: "bank", sortOrder: 0 },
        { name: "Cash in Hand", type: "cash", sortOrder: 1 },
        { name: "e-Wallet", type: "ewallet", sortOrder: 2 },
      ])
      .run();
  }
}
