import type { OutboxStore } from "./outbox-store";
import type { PostFn } from "./types";

export type SyncReport = {
  saved: number;
  duplicates: number;
  rejected: number;
  /** Why it stopped early, if it did; what is left stays exactly where it was, to try again. */
  stopped: "unreachable" | "login" | "error" | null;
  errorStatus: number | null;
};

const BATCH = 25;

/**
 * Send what is waiting, oldest first, and file each verdict:
 *   saved / already there -> gone from the phone (the PC has it)
 *   rejected              -> kept, marked failed, with the PC's reason, for you to decide about
 * and if the PC can't be reached, wants the PIN, or errors, stop and leave everything as it was. Only `pending` entries
 * are sent: an entry the PC has refused is never retried until you say so.
 */
export async function syncOutbox(deps: { store: OutboxStore; post: PostFn }): Promise<SyncReport> {
  const report: SyncReport = { saved: 0, duplicates: 0, rejected: 0, stopped: null, errorStatus: null };
  const waiting = (await deps.store.list()).filter((e) => e.status === "pending").sort((a, b) => a.queuedAt - b.queuedAt);

  for (let i = 0; i < waiting.length; i += BATCH) {
    const batch = waiting.slice(i, i + BATCH);
    const outcome = await deps.post(batch.map((e) => e.entry));
    if (outcome.kind !== "results") {
      report.stopped = outcome.kind;
      if (outcome.kind === "error") report.errorStatus = outcome.status;
      return report;
    }
    const verdicts = new Map(outcome.results.map((r) => [r.clientId, r]));
    for (const item of batch) {
      const verdict = verdicts.get(item.entry.clientId);
      if (!verdict) continue; // no word on this one: it stays waiting
      if (verdict.status === "rejected") {
        await deps.store.put({ ...item, status: "failed", error: verdict.error ?? "Your PC didn't accept this entry.", attempts: item.attempts + 1 });
        report.rejected++;
      } else {
        await deps.store.remove(item.entry.clientId);
        if (verdict.status === "saved") report.saved++;
        else report.duplicates++;
      }
    }
  }
  return report;
}
