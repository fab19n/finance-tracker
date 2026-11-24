import { formatRM } from "@/lib/money";

/**
 * The rules for changing or deleting several entries at once. Pure: rows in, a verdict out, so the Server Actions and the
 * select bar say the same things. Nothing here touches the database.
 */

/** The most entries one bulk action takes. */
export const BULK_MAX = 200;

export type BulkRow = {
  id: number;
  type: "income" | "expense" | "transfer";
  amount: number;
  billId: number | null;
  shareId: number | null;
  importKey: string | null;
  importBatch: string | null;
};

/** An entry that something else relies on: a bill's "paid", a person's payment, or a bank import's record of it. */
export function isLinked(r: Pick<BulkRow, "billId" | "shareId" | "importKey" | "importBatch">): boolean {
  return Boolean(r.billId || r.shareId || r.importKey || r.importBatch);
}

/** Ids as the client sent them: positive whole numbers, each once, in order. Anything else is dropped. */
export function cleanIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  for (const v of raw) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isInteger(n) && n > 0) seen.add(n);
  }
  return [...seen];
}

export type Selection = { count: number; income: number; incomeSen: number; expense: number; expenseSen: number; transfers: number; transferSen: number; linked: number };

/** What a selection holds, for the delete sheet's words. */
export function summarize(rows: { type: "income" | "expense" | "transfer"; amount: number; linked: boolean }[]): Selection {
  const s: Selection = { count: 0, income: 0, incomeSen: 0, expense: 0, expenseSen: 0, transfers: 0, transferSen: 0, linked: 0 };
  for (const r of rows) {
    s.count++;
    if (r.linked) s.linked++;
    if (r.type === "income") {
      s.income++;
      s.incomeSen += r.amount;
    } else if (r.type === "expense") {
      s.expense++;
      s.expenseSen += r.amount;
    } else {
      s.transfers++;
      s.transferSen += r.amount;
    }
  }
  return s;
}

const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

/** The delete sheet for a selection: the count, what it adds up to, and what else the delete would undo. */
export function bulkDeleteSheet(s: Selection): { title: string; body: string; warnings: string[] } {
  const parts: string[] = [];
  if (s.expense) parts.push(`${formatRM(s.expenseSen)} of spending (${s.expense})`);
  if (s.income) parts.push(`${formatRM(s.incomeSen)} of income (${s.income})`);
  if (s.transfers) parts.push(`${formatRM(s.transferSen)} moved between accounts (${s.transfers})`);
  const warnings: string[] = [];
  if (s.linked) {
    warnings.push(
      `${entries(s.linked)} ${s.linked === 1 ? "is" : "are"} tied to a bill, a person who shares a bill, or a bank import: bills show as unpaid again, people owe again, and importing that statement again would bring them back.`,
    );
  }
  return {
    title: `Delete ${entries(s.count)}?`,
    body: `That is ${parts.join(", ") || "nothing"}. They will be removed from your books. This can't be undone.`,
    warnings,
  };
}

export type BulkVerdict = { ok: true } | { ok: false; error: string; needsConfirm?: number };

/** Can these ids be acted on at all? `found` is how many of them exist. */
function checkIds(ids: number[], found: number): BulkVerdict {
  if (ids.length === 0) return { ok: false, error: "Pick at least one entry first." };
  if (ids.length > BULK_MAX) return { ok: false, error: `Up to ${BULK_MAX} entries can be changed at once; ${ids.length} are selected.` };
  if (found !== ids.length) {
    const gone = ids.length - found;
    return { ok: false, error: `${entries(gone)} you selected no longer ${gone === 1 ? "exists" : "exist"}. Reload the list and try again.` };
  }
  return { ok: true };
}

/** Whether to set `category` on `rows` (the rows behind `ids`). Refuses mixes, transfers, and linked rows without `confirmLinked`. */
export function planSetCategory(
  ids: number[],
  rows: BulkRow[],
  category: { name: string; type: "income" | "expense"; archived: boolean } | null,
  confirmLinked: boolean,
): BulkVerdict {
  const basic = checkIds(ids, rows.length);
  if (!basic.ok) return basic;
  if (!category) return { ok: false, error: "That category doesn't exist." };
  if (category.archived) return { ok: false, error: `"${category.name}" is archived. Pick another category.` };
  const transfers = rows.filter((r) => r.type === "transfer").length;
  if (transfers > 0) {
    return { ok: false, error: `Transfers have no category. Unselect the ${transfers === 1 ? "transfer" : `${transfers} transfers`} and try again.` };
  }
  const income = rows.filter((r) => r.type === "income").length;
  const expense = rows.length - income;
  if (income > 0 && expense > 0) {
    return { ok: false, error: `This selection mixes ${income} income and ${expense} spending entries, which use different categories. Select one kind at a time.` };
  }
  if (category.type === "income" && expense > 0) return { ok: false, error: `"${category.name}" is an income category, but the selected ${expense === 1 ? "entry is" : "entries are"} spending.` };
  if (category.type === "expense" && income > 0) return { ok: false, error: `"${category.name}" is a spending category, but the selected ${income === 1 ? "entry is" : "entries are"} income.` };
  return linkedVerdict(rows, confirmLinked, "changed");
}

/** Whether to delete `rows`. Linked rows need `confirmLinked`. */
export function planDelete(ids: number[], rows: BulkRow[], confirmLinked: boolean): BulkVerdict {
  const basic = checkIds(ids, rows.length);
  if (!basic.ok) return basic;
  return linkedVerdict(rows, confirmLinked, "deleted");
}

function linkedVerdict(rows: BulkRow[], confirmLinked: boolean, verb: string): BulkVerdict {
  const linked = rows.filter(isLinked).length;
  if (linked > 0 && !confirmLinked) {
    return {
      ok: false,
      needsConfirm: linked,
      error: `${entries(linked)} ${linked === 1 ? "is" : "are"} tied to a bill, a person who shares a bill, or a bank import. Nothing was ${verb}: confirm that you mean them too, or unselect them.`,
    };
  }
  return { ok: true };
}

/** "Moved 3 entries to Eating Out." / "Deleted 3 entries." */
export const categorySetMessage = (n: number, category: string) => `Moved ${entries(n)} to ${category}.`;
export const bulkDeletedMessage = (n: number) => `Deleted ${entries(n)}.`;
