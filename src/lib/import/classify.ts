import { descriptionMatchesBill, normalizeName, type BillDef } from "@/lib/plan/bills";
import { pickShare, type ShareDef } from "@/lib/plan/shares";
import { stripBoilerplate } from "./boilerplate";
import { BUILTIN_RULES } from "./builtin-rules";
import { findCardHolds } from "./holds";
import type { StatementRow } from "./types";

/**
 * Decide what each statement line IS, so you review instead of typing. In priority order:
 *   1. already recorded here  -> skip (re-imports and overlapping statements are safe)
 *      a card hold released   -> skip (a pre-authorisation and its refund cancel out)
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
  /** For money in: the person (sharing one of your bills) whose payment this is. */
  shareId: number | null;
  /** For transfers: the OTHER account (money leaves the statement account to it, or arrives from it). */
  transferAccountId: number | null;
  source: "duplicate" | "hold" | "rule" | "share" | "bill" | "history" | "builtin" | "salary" | "default";
  /** 'low' rows are the ones to look at. */
  confidence: "high" | "low";
  /** One line of "why", shown on the review screen. */
  reason: string;
  /** For a duplicate matched to an entry that was already recorded (not by exact fingerprint): that entry's id. */
  matchedId?: number;
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
  /** What it was recorded from, for showing it back to you. */
  note?: string | null;
};

export type SavedRule = {
  pattern: string;
  kind: "expense" | "income" | "transfer";
  categoryId: number | null;
  item: string | null;
  billId: number | null;
  transferAccountId: number | null;
};

/** Someone who shares one of your bills, as far as the classifier needs to know them. */
export type ClassifyShare = Pick<ShareDef, "id" | "name" | "matchKeywords" | "share" | "active"> & { billName: string };

/** A payee your imported history files the same way every time (see history.ts). */
export type HistoryRule = { pattern: string; kind: "expense" | "income"; categoryId: number; item: string; count: number };

export type ClassifyContext = {
  accountId: number;
  categories: { id: number; name: string; type: "income" | "expense" }[];
  accounts: { id: number; type: string }[];
  bills: BillDef[];
  /** People who pay you back for a shared bill: money in from them is recognised as their payment. */
  shares?: ClassifyShare[];
  rules: SavedRule[];
  /** Payees already filed one way, every time, in what you have imported. Below your own rules and bills, above the built-ins. */
  history?: HistoryRule[];
  existing: ExistingTx[];
  /** Take-home pay in sen (0 if unknown): a credit near this on the spending account is probably salary. */
  expectedIncome: number;
  isSpendingAccount: boolean;
};

const SMALL_QR = 4_500; // RM 45: up to this, an unrecognised QR payment is assumed to be food
// QR payments only: a "DUITNOW TO ACCOUNT ..." line is a transfer between people, which this must never claim.
const QR_PAYMENT = /\bduitnow qr\b|\bmae qr\b|\bmbbqr/;
// Wording of a movement between accounts (people or your own). A QR payment never is one, even if it starts "IBK FUND TFR".
const TRANSFER_WORDS = /\b(?:transfer|tfr|mbb ct|giro|ibft|duitnow to account|duitnow to mobile)\b/;

const NOISE_TOKENS = new Set(["ibg", "ibk", "ibft", "pos", "fpx", "giro", "instant", "online", "ref", "txn"]);

/**
 * The stable core of a description: the payee, without the bank's wrapper words or reference numbers, at most four
 * words. Used to group payees on the review screen and to remember rules. Empty when nothing identifies the payee
 * (a bare "MBBQR1234 ..." line), so such lines are never grouped together or turned into a rule.
 */
export function rulePattern(description: string): string {
  const tokens = normalizeName(stripBoilerplate(description))
    .split(" ")
    .filter((t) => t && !NOISE_TOKENS.has(t) && !/\d/.test(t));
  // "a l" (from A/L) alone would match half the statement: something readable has to be in there.
  return tokens.some((t) => t.length >= 3) ? tokens.slice(0, 4).join(" ") : "";
}

/** "IBK FUND TFR FR A/C RESTORAN MAHBUB *QR123" -> "Restoran Mahbub". Short, readable, no wrapper words or reference numbers. */
export function cleanItem(description: string): string {
  const words = stripBoilerplate(description)
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w) && !/^\d+$/.test(w) && !(/\d/.test(w) && w.length >= 5))
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
  const holds = findCardHolds(rows);

  return rows.map((row, i): ClassifiedRow => {
    const key = keys[i];
    const out = row.amount < 0;
    const abs = Math.abs(row.amount);
    const norm = normalizeName(row.description);
    // A line with no identifiable payee gets a group of its own, so correcting it never touches another line.
    const group = rulePattern(row.description) || `line-${row.index}`;
    const item = cleanItem(row.description);
    const make = (p: Partial<Proposal> & Pick<Proposal, "kind" | "source" | "confidence" | "reason">): ClassifiedRow => ({
      ...row,
      key,
      group,
      proposal: { categoryId: null, item, billId: null, shareId: null, transferAccountId: null, ...p },
    });

    // 1. Already here?
    if (knownKeys.has(key)) return make({ kind: "skip", source: "duplicate", confidence: "high", reason: "Already imported from this statement" });
    const hold = holds.get(row.index);
    if (hold) return make({ kind: "skip", source: "hold", confidence: "high", reason: hold });
    // Looks like a transfer if it says so, or if a rule you taught it knows this name is a transfer (so a layout that
    // drops the bank's wording, leaving just "JANE A/L DOE", is still recognised).
    const transferLike = rules.some((r) => r.kind === "transfer" && norm.includes(normalizeName(r.pattern))) || (!QR_PAYMENT.test(norm) && TRANSFER_WORDS.test(norm));
    const near = ctx.existing
      .filter((e) => !consumed.has(e.id) && e.amount === abs)
      .map((e) => {
        const mine = out ? e.accountId === ctx.accountId : e.type !== "transfer" ? e.accountId === ctx.accountId : e.toAccountId === ctx.accountId;
        const matchesSign = out ? (e.type === "expense" || e.type === "transfer") : (e.type === "income" || e.type === "transfer");
        // An entry typed in by hand can be a day or two off. One imported from a statement carries the bank's own
        // posting date, so it is the same line only on the same day: tomorrow's RM 8 lunch is not today's.
        const imported = e.importKey !== null;
        // A transfer imported from the OTHER account's statement is mirrored here, but only a transfer-looking line is
        // its other half (a RM 50 QR payment is not, even when the amounts and dates happen to agree).
        if (imported && e.type === "transfer" && !transferLike) return null;
        const window = e.type === "transfer" ? 3 : imported ? 0 : 2;
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
        matchedId: near.e.id,
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

    // 2b. A person who shares one of your bills, paying you their part. (Several people matching, or an amount that fits
    // no whole month, is left for you rather than guessed.)
    if (!out && ctx.shares?.length) {
      const who = pickShare(ctx.shares, row.description, abs);
      if (who) {
        const cat = catByName.get("Reimbursements") ?? catByName.get("Other Income");
        return make({
          kind: "income",
          categoryId: cat?.id ?? null,
          item: `${who.billName} share`,
          shareId: who.id,
          source: "share",
          confidence: "high",
          reason: `${who.name} paying their share of ${who.billName}`,
        });
      }
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

    // 3b. A payee your own imported history files one way, every time. Never for a name a transfer rule knows (your own
    // name): on the statement that rule points back at, step 2 skips it, and the line must NOT fall through to here and
    // be filed as spending when it is money moving between your accounts.
    const payee = rulePattern(row.description);
    const knownTransferName = rules.some((r) => r.kind === "transfer" && norm.includes(normalizeName(r.pattern)));
    const past = payee && !knownTransferName ? ctx.history?.find((h) => h.pattern === payee && h.kind === (out ? "expense" : "income")) : undefined;
    const pastCat = past ? ctx.categories.find((c) => c.id === past.categoryId && c.type === past.kind) : undefined;
    if (past && pastCat) {
      return make({
        kind: past.kind,
        categoryId: pastCat.id,
        item: past.item || item,
        source: "history",
        confidence: "high",
        reason: `You've filed this as ${pastCat.name} ${past.count} times before`,
      });
    }

    // 4. A merchant we know.
    const known =BUILTIN_RULES.find((r) => r.direction === (out ? "out" : "in") && r.pattern.test(norm));
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

    // 6a. A small QR payment is most often a meal or a snack. Say so, but still ask for a look: it is a guess.
    const eating = catByName.get("Eating Out");
    if (out && eating && abs <= SMALL_QR && QR_PAYMENT.test(norm)) {
      return make({
        kind: "expense",
        categoryId: eating.id,
        source: "default",
        confidence: "low",
        reason: "A small QR payment: assumed to be food. Change it if it isn't (it will be remembered)",
      });
    }

    // 6b. Unknown: record it plainly and ask for a look.
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
