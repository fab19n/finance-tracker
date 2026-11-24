/**
 * The "Saved" notice after a form: an action redirects back with `?saved=<key>` (and, when the sentence needs a name or an
 * amount, `&note=...`), and the page shows `savedMessage(...)` as a status banner. The keys are a fixed list so a crafted
 * link can only show one of these sentences (the note is plain text, capped, and React escapes it). Pure.
 */
export const SAVED = {
  bill: "Bill saved.",
  billPaid: "Payment recorded and linked to the bill.",
  billDeleted: "Bill deleted.",
  salary: "Salary recorded. Your pay cycle now starts from it.",
  paydayTransfer: "Transfer to savings recorded.",
  account: "Account saved.",
  accountArchived: "Account archived.",
  accountRestored: "Account restored.",
  category: "Category saved.",
  categoryArchived: "Category archived.",
  categoryRestored: "Category restored.",
  payday: "Payday settings saved.",
  assumptions: "Investing assumptions saved.",
  investmentAdded: "Investment added.",
  value: "Value updated.",
  flow: "Transfer recorded.",
  holding: "Price tracking saved.",
  investmentArchived: "Investment archived.",
  person: "Saved.",
  personRemoved: "Person removed from the bill.",
  split: "How the bill is split was saved.",
  turns: "Turns saved.",
  monthCovered: "Month given to them.",
  counted: "Payment counted towards their months.",
} as const;

export type SavedKey = keyof typeof SAVED;

const isKey = (k: string): k is SavedKey => Object.prototype.hasOwnProperty.call(SAVED, k);

/** `to` with these query parameters added (after any it already has); empty values are left out. */
export function withParams(to: string, params: Record<string, string | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`);
  if (parts.length === 0) return to;
  return `${to}${to.includes("?") ? "&" : "?"}${parts.join("&")}`;
}

/** The query that says "this worked": `{ saved: key, note }`. */
export function savedParams(key: SavedKey, note?: string): Record<string, string | undefined> {
  return { saved: key, note };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The sentence to show for `?saved=` and `?note=`, or null when there is nothing (or an unknown key). */
export function savedMessage(saved: string | string[] | undefined, note?: string | string[] | undefined): string | null {
  const key = first(saved);
  if (!key || !isKey(key)) return null;
  const extra = first(note)?.trim().slice(0, 200);
  return extra ? `${SAVED[key]} ${extra}` : SAVED[key];
}

/** Keep a numeric account id from a form (the Plan's account filter), or nothing. */
export function accountParam(raw: FormDataEntryValue | null | undefined): string | undefined {
  const s = typeof raw === "string" ? raw.trim() : "";
  return /^\d{1,9}$/.test(s) && Number(s) > 0 ? s : undefined;
}
