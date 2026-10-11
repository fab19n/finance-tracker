import type { WireEntry } from "@/lib/entry-shape";

/**
 * How an entry is described in the waiting list. Remembered when it is typed, so the list reads the same whatever happens
 * to accounts and categories on the PC in the meantime, and needs none of the app's reference data to draw.
 */
export type EntryLabels = { account: string; toAccount: string | null; category: string | null; icon: string | null };

/** An entry on the phone that the PC has not accepted yet. The phone keeps these until it has. */
export type OutboxEntry = {
  entry: WireEntry;
  labels: EntryLabels;
  queuedAt: number;
  /**
   * pending: waiting for the PC to be reachable. failed: the PC looked at it and said no (see `error`), so it waits for
   * you to retry it, correct it, or throw it away. Nothing is retried behind your back once the PC has refused it.
   */
  status: "pending" | "failed";
  error: string | null;
  attempts: number;
};

/** The PC's verdict on one entry (see src/app/sync/entries/route.ts). */
export type WireResult = { clientId: string; status: "saved" | "duplicate" | "rejected"; id?: number; error?: string };

/** What came of one attempt to reach the PC. */
export type PostOutcome =
  | { kind: "results"; results: WireResult[] }
  /** No answer: the PC is asleep, off, or this phone can't reach it. Nothing is wrong with the entries. */
  | { kind: "unreachable" }
  /** The PC wants the PIN again before it will take anything. */
  | { kind: "login" }
  /** The PC answered, but with something other than a verdict. */
  | { kind: "error"; status: number };

export type PostFn = (entries: WireEntry[], options?: { timeoutMs?: number }) => Promise<PostOutcome>;
