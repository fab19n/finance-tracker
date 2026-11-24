import { shortDate } from "@/lib/dates";
import { formatRM } from "@/lib/money";

/** What the delete sheet needs to know about an entry. All of it is on a list row already. */
export type DeletableEntry = {
  type: "income" | "expense" | "transfer";
  amount: number;
  date: string;
  item: string | null;
  categoryName: string | null;
  accountName?: string | null;
  toAccountName?: string | null;
  billId?: number | null;
  shareId?: number | null;
  /** 1 when a bank statement import wrote it. */
  imported?: number;
};

/** "teh tarik, RM 3.50": the words that name ONE entry (for a button's label and the sheet's title). */
export function entryName(e: DeletableEntry): string {
  const what =
    e.item?.trim() ||
    (e.type === "transfer" ? (e.accountName && e.toAccountName ? `Transfer ${e.accountName} to ${e.toAccountName}` : "Transfer") : e.categoryName) ||
    "Entry";
  return `${what}, ${formatRM(e.amount)}`;
}

/** What deleting would also undo, one plain sentence each: a bill left unpaid, a person owing again, an import that returns. */
export function deleteWarnings(e: Pick<DeletableEntry, "billId" | "shareId" | "imported">): string[] {
  const out: string[] = [];
  if (e.billId) out.push("It is counted as a payment of one of your bills, so that bill will show as unpaid again.");
  if (e.shareId) out.push("It is counted as a payment from someone who shares a bill with you, so they will owe it again.");
  if (e.imported) out.push("It came from a bank statement. Importing that statement again would bring it back.");
  return out;
}

/** The sheet that asks before deleting: a title naming the entry, the date, and anything else the delete would undo. */
export function deleteSheet(e: DeletableEntry): { title: string; body: string; warnings: string[] } {
  return {
    title: `Delete ${entryName(e)}?`,
    body: `Dated ${shortDate(e.date)}. It will be removed from your books. This can't be undone.`,
    warnings: deleteWarnings(e),
  };
}

/* ---------- Undo after deleting one entry ---------- */

/** How long the "Entry deleted. Undo" notice stays. */
export const UNDO_MS = 8000;

/** Every column of a transaction: what is kept so a deleted entry can be put back exactly as it was. */
export type RestorableRow = {
  id: number;
  date: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  accountId: number;
  toAccountId: number | null;
  categoryId: number | null;
  item: string | null;
  merchant: string | null;
  note: string | null;
  billId: number | null;
  shareId: number | null;
  importKey: string | null;
  clientId: string | null;
  importBatch: string | null;
  sharePrevItem: string | null;
  sharePrevCategoryId: number | null;
  createdAt: string;
};

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): string {
  const padded = token.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** The deleted row as one URL-safe token (nulls left out). The client keeps it for 8 seconds and hands it back to restore. */
export function encodeUndo(row: RestorableRow): string {
  const compact = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null));
  return toBase64Url(JSON.stringify(compact));
}

/** Whatever a token holds (unchecked: the restore action validates it), or null when it is not a token at all. */
export function decodeUndo(token: unknown): unknown {
  if (typeof token !== "string" || token.length === 0 || token.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    return JSON.parse(fromBase64Url(token));
  } catch {
    return null;
  }
}

/** `path` (a same-site path, maybe with a #fragment) with `?deleted=<token>` added before the fragment. */
export function withDeleted(path: string, token: string): string {
  const hash = path.indexOf("#");
  const base = hash >= 0 ? path.slice(0, hash) : path;
  const frag = hash >= 0 ? path.slice(hash) : "";
  return `${base}${base.includes("?") ? "&" : "?"}deleted=${token}${frag}`;
}

/** The token in an address's query string, and that query string without it. Null when there is none. */
export function takeDeleted(search: string): { token: string; rest: string } | null {
  const params = new URLSearchParams(search);
  const token = params.get("deleted");
  if (!token) return null;
  params.delete("deleted");
  const rest = params.toString();
  return { token, rest: rest ? `?${rest}` : "" };
}
