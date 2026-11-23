/**
 * How an account's card looks. Pure: an account in, colours and a mark out (no database, no clock).
 *
 * The COLOUR follows the bank (by name) unless the owner picked one; an unknown bank stays plain (the theme's card
 * colour). The MARK in the corner is the owner's choice (`accounts.card_network`), or none.
 */

export const CARD_NETWORKS = [
  { key: "visa", label: "Visa" },
  { key: "mastercard", label: "Mastercard" },
  { key: "amex", label: "American Express" },
  { key: "unionpay", label: "UnionPay" },
  { key: "mydebit", label: "MyDebit" },
  { key: "tng", label: "Touch 'n Go" },
] as const;

export type NetworkKey = (typeof CARD_NETWORKS)[number]["key"];

/** A mark: one of the known networks, or "Other" with the owner's own short name. */
export type CardMark = { kind: "network"; key: NetworkKey } | { kind: "other"; name: string } | null;

export const OTHER_NAME_MAX = 12;

/** `accounts.card_network` is `visa`, `other:Name` or empty. Anything unreadable is no mark rather than an error. */
export function parseMark(raw: string | null | undefined): CardMark {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (v.startsWith("other:")) {
    const name = v.slice(6).trim().slice(0, OTHER_NAME_MAX);
    return name ? { kind: "other", name } : null;
  }
  const hit = CARD_NETWORKS.find((n) => n.key === v);
  return hit ? { kind: "network", key: hit.key } : null;
}

/** The form's choice back to the stored text. "other" needs a name; without one it is no mark. */
export function markToStored(choice: string, otherName: string): string | null {
  if (choice === "other") {
    const name = otherName.trim().slice(0, OTHER_NAME_MAX);
    return name ? `other:${name}` : null;
  }
  return CARD_NETWORKS.some((n) => n.key === choice) ? choice : null;
}

export const HEX = /^#[0-9a-fA-F]{6}$/;

/** Bank colours, matched on the account's name (a dark shaded yellow for Maybank, red CIMB, blue Touch 'n Go). */
const BANKS: { match: RegExp; color: string }[] = [
  { match: /maybank|\bmae\b/i, color: "#b8890f" },
  { match: /cimb/i, color: "#a82129" },
  { match: /touch\s*'?n'?\s*go|\btng\b/i, color: "#1e58b8" },
];

export function bankColor(name: string): string | null {
  return BANKS.find((b) => b.match.test(name))?.color ?? null;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#0b1411";

/** Whichever of white or a near-black green reads better on `bg`. */
export function textOn(bg: string): string {
  return contrast(bg, LIGHT_TEXT) >= contrast(bg, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

export type CardLook = {
  /** null = a plain card: the theme's own colours (CSS classes), not a fixed fill. */
  bg: string | null;
  fg: string | null;
};

/** The owner's colour first, then the bank's, then plain. */
export function cardLook(a: { name: string; cardColor: string | null }): CardLook {
  const bg = a.cardColor && HEX.test(a.cardColor) ? a.cardColor.toLowerCase() : bankColor(a.name);
  return bg ? { bg, fg: textOn(bg) } : { bg: null, fg: null };
}

/** Last four digits as typed: spaces dropped; anything but exactly four digits is no number. */
export function cleanLast4(raw: string): string | null {
  const v = raw.replace(/\s+/g, "");
  return /^\d{4}$/.test(v) ? v : null;
}
