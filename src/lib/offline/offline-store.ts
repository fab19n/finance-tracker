import type { WireEntry } from "@/lib/entry-shape";
import type { OutboxStore } from "./outbox-store";
import { syncOutbox, type SyncReport } from "./sync-engine";
import type { EntryLabels, OutboxEntry, PostFn } from "./types";

export type Connection = "unknown" | "online" | "offline";

export type OfflineState = Readonly<{
  /** The outbox has been read from the phone's storage. */
  ready: boolean;
  /** The phone can keep an outbox at all. When it can't, the form saves straight to the PC, as it always did. */
  available: boolean;
  connection: Connection;
  syncing: boolean;
  /** Waiting and failed entries, oldest first. */
  entries: readonly OutboxEntry[];
  /** The entry being corrected in the form right now, if any. */
  editingId: string | null;
  lastOnlineAt: number | null;
  /** This page is a copy the phone saved (when), not what the PC just said. Cleared once the page has been refreshed. */
  savedCopyAt: number | null;
  /** The PC wants the PIN again before it will take what is waiting. */
  needsLogin: boolean;
  /** The PC answered, but with an error (this status), so what is waiting is still waiting. */
  serverError: number | null;
  /** The last thing that went through, for a short "Sent 2 entries" notice. */
  sent: { count: number; at: number } | null;
}>;

/** What happened to an entry the moment it was typed in. */
export type SubmitResult =
  | { kind: "saved" }
  | { kind: "queued"; why: "offline" | "unreachable" | "login" | "error" }
  | { kind: "rejected"; error: string }
  | { kind: "unavailable" };

export type OfflineDeps = {
  /** Null where the phone has no storage for it. */
  store: OutboxStore | null;
  post: PostFn;
  /** Is the PC there? Any answer at all counts; only silence is "no". */
  probe: () => Promise<boolean>;
  now?: () => number;
  /** `navigator.onLine`: the phone itself knows it has no network (airplane mode). */
  isNetworkUp?: () => boolean;
  readLastOnline?: () => number | null;
  writeLastOnline?: (at: number) => void;
  /** Was this page a saved copy (the service worker marks it)? When was it saved? */
  readSavedCopyAt?: () => number | null;
  /** The page has been refreshed: it is a copy no longer. */
  clearSavedCopyMarker?: () => void;
  /** Run the job unless another window of the app is already doing it. */
  exclusive?: (job: () => Promise<void>) => Promise<void>;
  /** Something reached the PC: bring what is on screen up to date. */
  onSaved?: () => void;
  /** The PC is back after being gone. */
  onReconnected?: () => void;
  /** The PC answered a check. */
  onReachable?: () => void;
  /** After every change (the app badge, say). */
  onChange?: (state: OfflineState) => void;
  /** Do something later (tests drive this by hand). */
  later?: (job: () => void, ms: number) => void;
};

/** How long a freshly typed entry waits for the PC before it is put in the outbox and the form moves on. */
const IMMEDIATE_MS = 6000;
/** How long "Sent 2 entries" stays up. */
const SENT_NOTICE_MS = 6000;

export const pending = (s: OfflineState) => s.entries.filter((e) => e.status === "pending");
export const failed = (s: OfflineState) => s.entries.filter((e) => e.status === "failed");

export type OfflineStore = ReturnType<typeof createOfflineStore>;

export function createOfflineStore(deps: OfflineDeps) {
  const now = deps.now ?? Date.now;
  const serverState: OfflineState = {
    ready: false,
    available: true,
    connection: "unknown",
    syncing: false,
    entries: [],
    editingId: null,
    lastOnlineAt: null,
    savedCopyAt: null,
    needsLogin: false,
    serverError: null,
    sent: null,
  };
  let state: OfflineState = {
    ...serverState,
    available: deps.store !== null,
    lastOnlineAt: deps.readLastOnline?.() ?? null,
    savedCopyAt: deps.readSavedCopyAt?.() ?? null,
  };
  const listeners = new Set<() => void>();

  function set(patch: Partial<OfflineState>) {
    state = { ...state, ...patch };
    for (const l of listeners) l();
    deps.onChange?.(state);
  }

  const find = (id: string) => state.entries.find((e) => e.entry.clientId === id);
  const later = deps.later ?? ((job: () => void, ms: number) => void setTimeout(job, ms));

  /** Something went through: say so for a few seconds. */
  function noteSent(count: number) {
    const at = now();
    set({ sent: { count, at } });
    later(() => {
      if (state.sent?.at === at) set({ sent: null });
    }, SENT_NOTICE_MS);
  }

  /** Read the phone's storage again (another window of the app may have changed it). */
  async function reload() {
    if (!deps.store) {
      set({ ready: true });
      return;
    }
    try {
      const all = (await deps.store.list()).sort((a, b) => a.queuedAt - b.queuedAt);
      set({
        entries: all,
        ready: true,
        editingId: state.editingId && all.some((e) => e.entry.clientId === state.editingId) ? state.editingId : null,
      });
    } catch {
      set({ available: false, ready: true });
    }
  }

  /** The PC answered something. */
  function markReachable() {
    const at = now();
    deps.writeLastOnline?.(at);
    set({ connection: "online", lastOnlineAt: at });
  }
  /** The PC answered with a verdict, which means the PIN (if any) was good and nothing is broken. */
  function markWorking() {
    markReachable();
    set({ needsLogin: false, serverError: null });
  }

  // ---- sending what is waiting ----------------------------------------------------------------------------------------

  let sending: Promise<void> | null = null;
  let askedAgain = false;
  /**
   * Send everything waiting. One run at a time, however many things ask; and if something asks while a run is going (a
   * Retry tapped mid-send), the run goes round once more afterwards, so the tap is never left waiting for the next check.
   */
  function syncNow(): Promise<void> {
    if (sending) {
      askedAgain = true;
      return sending;
    }
    sending = (async () => {
      do {
        askedAgain = false;
        await run();
        // No point going round again against a PC that just said it isn't there, wants the PIN, or errored.
      } while (askedAgain && state.connection !== "offline" && !state.needsLogin && state.serverError === null);
    })().finally(() => {
      sending = null;
    });
    return sending;
  }
  async function run() {
    const store = deps.store;
    if (!store || !state.entries.some((e) => e.status === "pending")) return;
    const job = async () => {
      set({ syncing: true });
      try {
        applyReport(await syncOutbox({ store, post: deps.post }));
        await reload();
      } finally {
        set({ syncing: false });
      }
    };
    await (deps.exclusive ? deps.exclusive(job) : job());
  }
  function applyReport(report: SyncReport) {
    const sentCount = report.saved + report.duplicates;
    if (sentCount > 0) {
      noteSent(sentCount);
      deps.onSaved?.();
    }
    if (report.stopped === "unreachable") set({ connection: "offline" });
    else if (report.stopped === "login") set({ connection: "online", needsLogin: true });
    else if (report.stopped === "error") set({ connection: "online", serverError: report.errorStatus });
    else markWorking();
  }

  // ---- is the PC there? -----------------------------------------------------------------------------------------------

  let checking: Promise<void> | null = null;
  /** Ask the PC whether it is there; if it is, send what is waiting. One at a time. */
  function check(): Promise<void> {
    return (checking ??= look().finally(() => {
      checking = null;
    }));
  }
  async function look() {
    await reload();
    if (deps.isNetworkUp?.() === false || !(await deps.probe())) {
      set({ connection: "offline" });
      return;
    }
    const wasGone = state.connection === "offline";
    const showingCopy = state.savedCopyAt !== null;
    markReachable();
    deps.onReachable?.();
    await syncNow();
    // The PC is back, or it was there all along and the page on screen is a saved copy: either way what is shown is out of
    // date, so fetch it afresh (and it is a copy no longer).
    if (showingCopy) {
      set({ savedCopyAt: null });
      deps.clearSavedCopyMarker?.();
    }
    if (wasGone || showingCopy) deps.onReconnected?.();
  }

  // ---- entries typed on the phone -------------------------------------------------------------------------------------

  /**
   * One attempt to send one entry that is already safe in the outbox. If the app is killed mid-request the entry is still
   * there, and sending it again is harmless: the PC recognises its clientId.
   * `onRejected`: a brand-new entry is dropped so the form keeps what was typed; an entry being corrected stays, failed,
   * with the PC's new answer.
   */
  async function attempt(item: OutboxEntry, onRejected: "drop" | "keep"): Promise<SubmitResult> {
    const store = deps.store!;
    const id = item.entry.clientId;
    const outcome = await deps.post([item.entry], { timeoutMs: IMMEDIATE_MS });
    if (outcome.kind === "unreachable") {
      set({ connection: "offline" });
      return { kind: "queued", why: "unreachable" };
    }
    if (outcome.kind === "login") {
      set({ connection: "online", needsLogin: true });
      return { kind: "queued", why: "login" };
    }
    if (outcome.kind === "error") {
      set({ connection: "online", serverError: outcome.status });
      return { kind: "queued", why: "error" };
    }
    const verdict = outcome.results.find((r) => r.clientId === id);
    if (!verdict) {
      set({ connection: "online", serverError: 0 });
      return { kind: "queued", why: "error" };
    }
    markWorking();
    if (verdict.status === "rejected") {
      const error = verdict.error ?? "Your PC didn't accept this entry.";
      if (onRejected === "drop") await store.remove(id);
      else await store.put({ ...item, status: "failed", error, attempts: item.attempts + 1 });
      await reload();
      return { kind: "rejected", error };
    }
    await store.remove(id);
    await reload();
    noteSent(1);
    deps.onSaved?.();
    void syncNow(); // whatever else was waiting can go now too
    return { kind: "saved" };
  }

  async function keep(item: OutboxEntry): Promise<boolean> {
    try {
      await deps.store!.put(item);
      await reload();
      return true;
    } catch {
      set({ available: false });
      return false;
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot: () => state,
    /** The same on the server and during hydration, so the first paint matches. */
    getServerSnapshot: () => serverState,

    /** Read the outbox, then see whether the PC is there. */
    async load() {
      await reload();
      await check();
    },
    check,
    syncNow,

    /**
     * A new entry. It goes into the phone's storage FIRST, then to the PC, so nothing typed in is ever only in flight.
     * `saved`: the PC has it. `queued`: it is safe on the phone and will go when the PC can be reached. `rejected`: the PC
     * refused it (and it is not kept: the form still has it, to fix). `unavailable`: no storage; the caller saves directly.
     */
    async submit(entry: WireEntry, labels: EntryLabels): Promise<SubmitResult> {
      if (!deps.store || !state.available) return { kind: "unavailable" };
      const item: OutboxEntry = { entry, labels, queuedAt: now(), status: "pending", error: null, attempts: 0 };
      if (!(await keep(item))) return { kind: "unavailable" };
      if (deps.isNetworkUp?.() === false) {
        set({ connection: "offline" });
        return { kind: "queued", why: "offline" };
      }
      if (state.connection === "offline") {
        // Known to be gone a moment ago: don't make the form wait for another timeout. Look again in the background.
        void check();
        return { kind: "queued", why: "unreachable" };
      }
      return attempt(item, "drop");
    },

    /** An entry that is already in the outbox, corrected, and sent again. */
    async update(id: string, entry: WireEntry, labels: EntryLabels): Promise<SubmitResult> {
      if (!deps.store || !state.available) return { kind: "unavailable" };
      const before = find(id);
      const item: OutboxEntry = {
        entry: { ...entry, clientId: id },
        labels,
        queuedAt: before?.queuedAt ?? now(),
        status: "pending",
        error: null,
        attempts: before?.attempts ?? 0,
      };
      if (!(await keep(item))) return { kind: "unavailable" };
      const networkDown = deps.isNetworkUp?.() === false;
      if (networkDown || state.connection === "offline") {
        if (networkDown) set({ connection: "offline" });
        else void check(); // known to be gone a moment ago: look again in the background rather than wait out a timeout
        set({ editingId: null });
        return { kind: "queued", why: networkDown ? "offline" : "unreachable" };
      }
      const result = await attempt(item, "keep");
      if (result.kind !== "rejected") set({ editingId: null });
      return result;
    },

    /** Send an entry the PC refused, again, as it is. */
    async retry(id: string) {
      const item = find(id);
      if (!item || item.status !== "failed" || !deps.store) return;
      await keep({ ...item, status: "pending", error: null });
      await syncNow();
    },
    async retryAll() {
      if (!deps.store) return;
      for (const item of state.entries.filter((e) => e.status === "failed")) await deps.store.put({ ...item, status: "pending", error: null });
      await reload();
      await syncNow();
    },
    /** Throw an entry away. */
    async discard(id: string) {
      if (!deps.store) return;
      await deps.store.remove(id);
      await reload();
    },

    startEdit: (id: string) => set({ editingId: find(id) ? id : null }),
    cancelEdit: () => set({ editingId: null }),
  };
}
