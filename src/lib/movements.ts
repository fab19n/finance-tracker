/** How many of an account's movements its page lists: a first screenful, then View more adds a step, up to a cap. */
export const FIRST = 6;
export const STEP = 12;
export const CAP = 120;

/** `?show=` is forgiving: junk means the first page, never below it, never above the cap. */
export function movementsShown(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > FIRST ? Math.min(n, CAP) : FIRST;
}
