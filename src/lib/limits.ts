/**
 * Ceilings for typed amounts. Money is integer sen and a JS number is exact only up to 2^53, so an amount is
 * refused well below that: RM 1 billion is far past anything a personal book holds.
 */
export const MAX_SEN = 100_000_000_000;
export const MAX_AMOUNT_MESSAGE = "That amount is too large (the most is RM 1,000,000,000)";

/** True when `sen` is a whole number of sen no bigger than the ceiling (the sign is ignored). */
export const withinLimit = (sen: number): boolean => Number.isSafeInteger(sen) && Math.abs(sen) <= MAX_SEN;
