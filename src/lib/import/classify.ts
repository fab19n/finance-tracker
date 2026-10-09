import { descriptionMatchesBill, normalizeName, type BillDef } from "@/lib/plan/bills";
import { BUILTIN_RULES } from "./builtin-rules";
import type { StatementRow } from "./types";

/**
 * Decide what each statement line IS, so you review instead of typing. In priority order:
 *   1. already recorded here  -> skip (re-imports and overlapping statements are safe)
 *   2. a rule you taught it   -> your decision wins
 *   3. a recurring bill       -> linked to the bill
 *   4. a known merchant       -> category
 *   5. looks like your salary -> income
 *   6. anything else          -> Miscellaneous / Other income, flagged for review
 */

export type ProposalKind = "expense" | "income" | "transfer" | "skip";

export type Proposal = {
  kind: ProposalKind;
  categoryId: number | null;
  item: string;
  billId: number | null;
  /** For transfers: the OTHER account (money leaves the statement account to it, or arrives from it). */
  transferAccountId: number | null;
  source: "duplicate" | "rule" | "bill" | "builtin" | "salary" | "default";
  /** 'low' rows are the ones to look at. */
  confidence: "high" | "low";
  /** One line of "why", shown on the review screen. */
  reason: string;
};

export type ClassifiedRow = StatementRow & {
  /** Fingerprint for duplicate detection on a later import. */
  key: string;
  /** Rows sharing a group are the same payee; changing one can change them all. */
  group: string;
  proposal: Proposal;
};

export type ExistingTx = {
  id: number;
  date: string;
  amount: number; // positive
  type: "income" | "expense" | "transfer";
  accountId: number;
  toAccountId: number | null;
  importKey: string | null;
};

export type SavedRule = {
  pattern: string;
  kind: "expense" | "income" | "transfer";
  categoryId: number | null;
  item: string | null;
  billId: number | null;
  transferAccountId: number | null;
};

export type ClassifyContext = {
  accountId: number;
  categories: { id: number; name: string; type: "income" | "expense" }[];
  accounts: { id: number; type: string }[];
  bills: BillDef[];
  rules: SavedRule[];
  existing: ExistingTx[];
  /** Take-home pay in sen (0 if unknown): a credit near this on the spending account is probably salary. */
  expectedIncome: number;
  isSpendingAccount: boolean;
};

const NOISE_TOKENS = new Set(["ibg", "ibk", "ibft", "pos", "fpx", "giro", "instant", "online", "ref", "txn"]);

/** The stable core of a description: no reference numbers, at most four words. Used to group payees and to remember rules. */
export function rulePattern(description: string): string {
  const tokens = normalizeName(description)
    .split(" ")
    .filter((t) => t && !NOISE_TOKENS.has(t) && !/\d/.test(t));
  const core = tokens.slice(0, 4).join(" ");
  return core.length >= 3 ? core : normalizeName(description).split(" ").slice(0, 2).join(" ");
}

/** "DEBIT CARD PURCHASE PETRONAS 123456" -> "Debit Card Purchase Petronas". Short, readable, no reference numbers. */
export function cleanItem(description: string): string {
  const words = description
    .split(/\s+/)
    .filter((w) => w && !(/\d/.test(w) && w.length >= 5))
    .join(" ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .trim();
  return (words || "Statement entry").slice(0, 40);
}

/** Fingerprint of each row: account + date + amount + payee + which repeat of that exact line it is. */
export function rowKeys(rows: StatementRow[], accountId: number): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${accountId}:${r.date}|${r.amount}|${normalizeName(r.description).slice(0, 60)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}|${n}`;
  });
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

export function classifyRows(rows: StatementRow[], ctx: ClassifyContext): ClassifiedRow[] {
  const keys = rowKeys(rows, ctx.accountId);
  const knownKeys = new Set(ctx.existing.map((e) => e.importKey).filter((k): k is string => !!k));
  const consumed = new Set<number>(); // an existing entry can absorb only one statement line
  const catByName = new Map(ctx.categories.map((c) => [c.name, c]));
  const cashAccount = ctx.accounts.find((a) => a.type === "cash");
  const rules = [...ctx.rules].sort((a, b) => b.pattern.length - a.pattern.length);

  return rows.map((row, i): ClassifiedRow => {
    const key = keys[i];
    const out = row.amount < 0;
    const abs = Math.abs(row.amount);
    const norm = normalizeName(row.description);
    const group = rulePattern(row.description);
    const item = cleanItem(row.description);
    const make = (p: Partial<Proposal> & Pick<Proposal, "kind" | "source" | "confidence" | "reason">): ClassifiedRow => ({
      ...row,
      key,
      group,
      proposal: { categoryId: null, item, billId: null, transferAccountId: null, ...p },
    });

    // 1. Already here?
    if (knownKeys.has(key)) return make({ kind: "skip", source: "duplicate", confidence: "high", reason: "Already imported from this statement" });
    const near = ctx.existing
      .filter((e) => !consumed.has(e.id) && e.amount === abs)
      .map((e) => {
        const mine = out ? e.accountId === ctx.accountId : e.type !== "transfer" ? e.accountId === ctx.accountId : e.toAccountId === ctx.accountId;
        const matchesSign = out ? (e.type === "expense" || e.type === "transfer") : (e.type === "income" || e.type === "transfer");
        const window = e.type === "transfer" ? 3 : 2;
        const gap = dayDiff(e.date, row.date);
        return mine && matchesSign && gap <= window ? { e, gap } : null;
      })
      .filter((x): x is { e: ExistingTx; gap: number } => x !== null)
      .sort((a, b) => a.gap - b.gap)[0];
    if (near) {
      consumed.add(near.e.id);
      return make({
        kind: "skip",
        source: "duplicate",
        confidence: "high",
        reason: `Looks like the ${near.e.type} you already recorded on ${near.e.date}`,
      });
    }

    // 2. A rule you taught it.
    // A transfer rule names the OTHER account. Learned from the main account's statement ("-> Savings"), it
    // means nothing on the savings account's own statement, so a rule pointing at this very account is skipped.
    const rule = rules.find(
      (r) =>
        norm.includes(normalizeName(r.pattern)) &&
        (r.kind === "transfer" ? r.transferAccountId !== ctx.accountId : (r.kind === "expense") === out),
    );
    if (rule) {
      const bill = rule.billId ? ctx.bills.find((b) => b.id === rule.billId) : undefined;
      return make({
        kind: rule.kind,
        categoryId: rule.categoryId ?? bill?.categoryId ?? null,
        item: rule.item || bill?.name || item,
        billId: bill?.id ?? null,
        transferAccountId: rule.kind === "transfer" ? rule.transferAccountId : null,
        source: "rule",
        confidence: "high",
        reason: `Your rule for "${rule.pattern}"`,
      });
    }

    // 3. A recurring bill (money out of the account that pays it).
    if (out) {
      const candidates = ctx.bills.filter((b) => b.active && b.accountId === ctx.accountId);
      const byWord = candidates.filter((b) => descriptionMatchesBill(b, row.description));
      const inRange = (b: BillDef, slack: number) => abs >= b.amountMin * (1 - slack) && abs <= b.amountMax * (1 + slack);
      const closest = (list: BillDef[]) => [...list].sort((a, b) => Math.abs(abs - (a.amountMin + a.amountMax) / 2) - Math.abs(abs - (b.amountMin + b.amountMax) / 2))[0];
      const strong = byWord.filter((b) => inRange(b, 0.2));
      const hit = strong.length ? closest(strong) : byWord.length ? closest(byWord) : undefined;
      if (hit) {
        return make({
          kind: "expense",
          categoryId: hit.categoryId,
          item: hit.name,
          billId: hit.id,
          source: "bill",
          confidence: strong.length ? "high" : "low",
          reason: strong.length ? `Matches your bill "${hit.name}"` : `Name matches "${hit.name}" but the amount is unusual`,
        });
      }
      // A bill with no statement keywords (rent paid to a person) can only be recognised by its amount.
      const byAmount = candidates.filter((b) => !b.matchKeywords?.trim() && inRange(b, 0));
      if (byAmount.length === 1) {
        const b = byAmount[0];
        return make({
          kind: "expense",
          categoryId: b.categoryId,
          item: b.name,
          billId: b.id,
          source: "bill",
          confidence: "low",
          reason: `The amount fits your bill "${b.name}" - confirm it`,
        });
      }
    }

    // 4. A merchant we know.
    const known = BUILTIN_RULES.find((r) => r.direction === (out ? "out" : "in") && r.pattern.test(norm));
    if (known) {
      if (known.cash && cashAccount) {
        return make({
          kind: "transfer",
          item: known.item,
          transferAccountId: cashAccount.id,
          source: "builtin",
          confidence: "high",
          reason: "Cash withdrawal: moves money into your cash account (it isn't spending)",
        });
      }
      const cat = catByName.get(known.category);
      if (cat) {
        return make({
          kind: out ? "expense" : "income",
          categoryId: cat.id,
          item: known.item,
          source: "builtin",
          confidence: "high",
          reason: `Recognised as ${known.category.toLowerCase()}`,
        });
      }
    }

    // 5. A credit close to your take-home pay, in the account salary lands in.
    if (!out && ctx.isSpendingAccount && ctx.expectedIncome > 0 && abs >= ctx.expectedIncome * 0.75 && abs <= ctx.expectedIncome * 1.25) {
      const salary = catByName.get("Salary");
      if (salary) {
        return make({
          kind: "income",
          categoryId: salary.id,
          item: "Salary",
          source: "salary",
          confidence: "low",
          reason: "Close to your take-home pay - is this your salary?",
        });
      }
    }

    // 6. Unknown: record it plainly and ask for a look.
    const fallback = catByName.get(out ? "Miscellaneous" : "Other Income");
    return make({
      kind: out ? "expense" : "income",
      categoryId: fallback?.id ?? null,
      source: "default",
      confidence: "low",
      reason: "Not recognised - pick a category (it will be remembered)",
    });
  });
}
