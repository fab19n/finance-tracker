/**
 * The Add form's small pure decisions, kept out of the component so they can be tested without a browser:
 * the docked button's words, which categories are on show, which icon a category gets and which day chip is chosen.
 */
import { shiftDays } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import type { DuoName } from "@/components/DuoIcon";

export type EntryType = "income" | "expense" | "transfer";

const VERB: Record<EntryType, string> = { expense: "Add expense", income: "Add income", transfer: "Add transfer" };

/**
 * The docked button: what pressing it does, and for how much. Editing a saved entry and correcting one waiting in the
 * outbox keep their own words. While the "already in your books?" warning is up the button says "anyway". The amount is
 * `sen` (null or 0 while the box is empty or unreadable: then the button names the action only).
 */
export function submitLabel(p: { editing: boolean; correcting: boolean; type: EntryType; sen: number | null; anyway: boolean }): string {
  if (p.editing) return "Save changes";
  const verb = p.correcting ? "Save and send" : VERB[p.type];
  const base = p.anyway ? `${verb} anyway` : verb;
  return p.sen !== null && p.sen > 0 ? `${base} · ${formatRM(p.sen)}` : base;
}

/** Categories shown before "Show all" (the sixth tile of a three-column grid). */
export const CATEGORY_PREVIEW = 5;

/**
 * Which categories to draw. Collapsed: the first five, plus the chosen one if it is further down (a hint can pick it), so a
 * choice is never hidden. With six or fewer there is nothing to fold away.
 */
export function visibleCategories<T extends { id: number }>(all: T[], selectedId: number | null, expanded: boolean): { shown: T[]; foldable: boolean } {
  if (all.length <= CATEGORY_PREVIEW + 1) return { shown: all, foldable: false };
  if (expanded) return { shown: all, foldable: true };
  const first = all.slice(0, CATEGORY_PREVIEW);
  const hidden = selectedId === null || first.some((c) => c.id === selectedId) ? undefined : all.find((c) => c.id === selectedId);
  return { shown: hidden ? [...first.slice(0, CATEGORY_PREVIEW - 1), hidden] : first, foldable: true };
}

/**
 * A dual-tone icon for a category, by what its NAME says. Categories are the owner's own words, so this only answers when
 * the name clearly means one of the icons that exist; otherwise null and the caller shows the category's initials
 * (never a wrong picture).
 */
export function categoryIconName(name: string): DuoName | null {
  const n = name.toLowerCase();
  const rules: [RegExp, DuoName][] = [
    [/e-?wallet|top-?\s?up|reload/, "ewallet"],
    // Specific words first: "Investment Income" is an investment, not cash.
    [/invest|dividend|stock|\bunit trust|\bfd\b|fixed deposit/, "invest"],
    [/salary|wage|bonus|allowance|pay\s?check|income|cash/, "cash"],
    // \brent: "rent" and "rental", but not the middle of "parents".
    [/\brent|mortgage|housing|\bhome|\bhouse|furnitur/, "home"],
    [/reimburs|shared|split|family|parents/, "shared"],
    [/utilit|electric|water|internet|phone/, "bolt"],
    [/bill|insurance|\btax(es)?\b|subscri|loan|install?ment/, "plan"],
    [/grocer|supermarket|market/, "cart"],
    [/eating|food|dining|restaurant|cafe|coffee|meal/, "utensils"],
    // Ahead of the car, so "Car Maintenance" is not drawn like everyday transport. "Maintain" also takes a misspelling.
    [/mainten|maintain|repair|mechanic/, "spanner"],
    [/transport|fuel|petrol|parking|toll|grab|taxi|car\b|vehicle/, "car"],
    [/shop|cloth|fashion|gadget/, "bag"],
    [/health|medic|pharmac|clinic|dental|doctor/, "heart"],
    [/entertain|movie|cinema|game|stream/, "film"],
    [/travel|flight|hotel|holiday|trip/, "plane"],
    [/gift|donat|charity|zakat/, "gift"],
    [/educat|school|course|book|tuition/, "book"],
    [/bank|fee|charge|transfer/, "bank"],
  ];
  return rules.find(([re]) => re.test(n))?.[1] ?? null;
}

/** Typing a figure this big (RM 10,000 or more) asks for a second tap: a slipped decimal point is the usual cause. */
export const LARGE_AMOUNT_SEN = 1_000_000;

/** What to say before saving a very large amount, or null when it is an ordinary one. */
export function largeAmountWarning(sen: number | null): string | null {
  if (sen === null || sen < LARGE_AMOUNT_SEN) return null;
  return `That is ${formatRM(sen)}. If it is right, press the button again to add it.`;
}

/** A past entry the form can offer as a one-tap start: what it was, its category and the last amount. */
export type QuickHint = { item: string; type: "income" | "expense"; categoryId: number | null; amount: number; count: number };

/**
 * Up to `max` regular entries of this type to show as chips above the amount: the most repeated first (the hints arrive
 * sorted that way), one per item, and only ones whose category can still be picked (an archived category would leave the
 * chip filling nothing in).
 */
export function quickHints(hints: QuickHint[], type: EntryType, categoryIds: number[], max = 6): QuickHint[] {
  if (type === "transfer") return [];
  const pickable = new Set(categoryIds);
  const seen = new Set<string>();
  const out: QuickHint[] = [];
  for (const h of hints) {
    if (h.type !== type) continue;
    if (h.categoryId !== null && !pickable.has(h.categoryId)) continue;
    const key = h.item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length === max) break;
  }
  return out;
}

/**
 * Arrow-key movement inside a radio group (a row of buttons that act as one control): where focus and the choice go next,
 * wrapping at the ends; Home and End jump. Null for any other key.
 */
export function nextRadioIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Which quick day chip matches the date in the form: "today", "yesterday", or neither. */
export function dayChoice(date: string, today: string): "today" | "yesterday" | null {
  if (date === today) return "today";
  if (date === shiftDays(today, -1)) return "yesterday";
  return null;
}
