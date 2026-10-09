export type Reconciliation =
  | { kind: "match"; amount: 0 }
  | { kind: "shortfall"; amount: number } // less cash than the books say -> unlogged spending
  | { kind: "surplus"; amount: number }; // more cash than the books say -> unlogged income / change

/**
 * Compare what the ledger says is in the wallet with what you actually counted (both in sen).
 * A shortfall is money you spent but never logged: it gets booked to "Unaccounted cash".
 */
export function reconcileCash(expected: number, actual: number): Reconciliation {
  const diff = expected - actual;
  if (diff === 0) return { kind: "match", amount: 0 };
  return diff > 0 ? { kind: "shortfall", amount: diff } : { kind: "surplus", amount: -diff };
}
