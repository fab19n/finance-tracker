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
    [/salary|wage|bonus|allowance|pay\s?check|income|cash/, "cash"],
    [/invest|dividend|stock|\bunit trust|\bfd\b|fixed deposit/, "invest"],
    [/rent|mortgage|housing|home|house|furnitur/, "home"],
    [/reimburs|shared|split|family|parents/, "shared"],
    [/utilit|electric|water|internet|phone/, "bolt"],
    [/bill|insurance|\btax|subscri|loan|install?ment/, "plan"],
    [/grocer|supermarket|market/, "cart"],
    [/eating|food|dining|restaurant|cafe|coffee|meal/, "utensils"],
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

/** Which quick day chip matches the date in the form: "today", "yesterday", or neither. */
export function dayChoice(date: string, today: string): "today" | "yesterday" | null {
  if (date === today) return "today";
  if (date === shiftDays(today, -1)) return "yesterday";
  return null;
}
