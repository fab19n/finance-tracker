import type { Selection } from "@/lib/entry-bulk";

/** The id of the select bar's form; every row's checkbox points at it with `form=`. */
export const BULK_FORM_ID = "bulk-form";

/** One ticked checkbox, read from its data attributes. */
export type TickedBox = { id: string; type: string; amount: number; linked: boolean };

/** Each entry once: the phone list and the desktop table both hold a box for it, and only one is on screen. */
export function uniqueTicked(boxes: TickedBox[]): TickedBox[] {
  const seen = new Set<string>();
  return boxes.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
}

/** Which kind of category fits the selection: null when it is empty, mixed, or holds a transfer. */
export function categoryKind(s: Selection): "income" | "expense" | null {
  if (s.count === 0 || s.transfers > 0) return null;
  if (s.income > 0 && s.expense > 0) return null;
  return s.income > 0 ? "income" : "expense";
}

/** Why "Set category" is unavailable, in words (empty when it is available or nothing is selected yet). */
export function categoryHint(s: Selection): string {
  if (s.count === 0) return "";
  if (s.transfers > 0) return "Transfers have no category: unselect them to set one.";
  if (s.income > 0 && s.expense > 0) return "Income and spending use different categories: select one kind at a time.";
  return "";
}
