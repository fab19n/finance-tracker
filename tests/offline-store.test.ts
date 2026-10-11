import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WireEntry } from "@/lib/entry-shape";
import { createOfflineStore, failed, pending, type OfflineDeps } from "@/lib/offline/offline-store";
import { memoryStore, type OutboxStore } from "@/lib/offline/outbox-store";
import { syncOutbox } from "@/lib/offline/sync-engine";
import type { EntryLabels, PostFn } from "@/lib/offline/types";

// The phone's outbox, against a pretend PC that can go away, ask for the PIN, error, refuse particular entries, or save an
// entry and then lose the reply (the case clientId exists for). No browser anywhere: storage, network and clock are injected.

let n = 0;
const entry = (over: Partial<WireEntry> = {}): WireEntry => ({
  clientId: `entry-${++n}-aaaaaaaa`,
  type: "expense",
  amount: 1250,
  date: "2026-10-11",
  accountId: 1,
  toAccountId: null,
  categoryId: 5,
  item: "Teh tarik",
  note: null,
  ...over,
});
const labels: EntryLabels = { account: "Cash in Hand", toAccount: null, category: "Eating Out", icon: "x" };

function pretendPc() {
  const pc = {
    up: true,
    login: false,
    errorStatus: 0,
    /** Save it, then lose the reply: the phone sees silence. */
    dropNextReply: false,
    refuse: (() => null) as (e: WireEntry) => string | null,
    saved: new Map<string, WireEntry>(),
    calls: [] as WireEntry[][],
  };
  const post: PostFn = async (entries) => {
    pc.calls.push(entries);
    if (!pc.up) return { kind: "unreachable" };
    if (pc.login) return { kind: "login" };
    if (pc.errorStatus) return { kind: "error", status: pc.errorStatus };
    const results = entries.map((e) => {
      const why = pc.refuse(e);
      if (why) return { clientId: e.clientId, status: "rejected" as const, error: why };
      const had = pc.saved.has(e.clientId);
      pc.saved.set(e.clientId, e);
      return { clientId: e.clientId, status: had ? ("duplicate" as const) : ("saved" as const), id: pc.saved.size };
    });
    if (pc.dropNextReply) {
      pc.dropNextReply = false;
      return { kind: "unreachable" };
    }
    return { kind: "results", results };
  };
  return { pc, post, probe: async () => pc.up };
}

let clock = 0;
function phone(over: Partial<OfflineDeps> = {}, store: OutboxStore | null = memoryStore()) {
  const p = pretendPc();
  const hooks = { onSaved: vi.fn(), onReconnected: vi.fn(), onReachable: vi.fn(), writeLastOnline: vi.fn() };
  const scheduled: { job: () => void; ms: number }[] = [];
  const later = (job: () => void, ms: number) => void scheduled.push({ job, ms });
  const s = createOfflineStore({ store, post: p.post, probe: p.probe, now: () => (clock += 10), later, ...hooks, ...over });
  return { s, pc: p.pc, hooks, store, scheduled, state: () => s.getSnapshot() };
}
beforeEach(() => {
  clock = 1000;
});

describe("a new entry", () => {
  it("goes to the PC, and once the PC has it nothing is left on the phone", async () => {
    const { s, pc, hooks, state } = phone();
    const e = entry();
    expect(await s.submit(e, labels)).toEqual({ kind: "saved" });
    expect([...pc.saved.keys()]).toEqual([e.clientId]);
    expect(state().entries).toEqual([]);
    expect(state()).toMatchObject({ connection: "online", sent: { count: 1 } });
    expect(hooks.onSaved).toHaveBeenCalledTimes(1);
  });

  it("is kept on the phone when the PC can't be reached, and says so", async () => {
    const { s, pc, state } = phone();
    pc.up = false;
    const e = entry();
    expect(await s.submit(e, labels)).toEqual({ kind: "queued", why: "unreachable" });
    expect(state().connection).toBe("offline");
    expect(pending(state()).map((x) => x.entry.clientId)).toEqual([e.clientId]);
    expect(pc.saved.size).toBe(0);
  });

  it("doesn't make you wait out another timeout once the PC is known to be gone", async () => {
    const { s, pc, state } = phone();
    pc.up = false;
    await s.submit(entry(), labels);
    pc.calls.length = 0;
    expect(await s.submit(entry(), labels)).toEqual({ kind: "queued", why: "unreachable" });
    expect(pc.calls).toEqual([]); // queued without a request: the form never waits
    expect(pending(state())).toHaveLength(2);
  });

  it("is queued straight away when the phone itself has no network (airplane mode)", async () => {
    const { s, pc, state } = phone({ isNetworkUp: () => false });
    expect(await s.submit(entry(), labels)).toEqual({ kind: "queued", why: "offline" });
    expect(pc.calls).toEqual([]);
    expect(state().connection).toBe("offline");
  });

  it("when the PC refuses it, comes back to the form (which keeps what was typed) and is not kept", async () => {
    const { s, pc, state } = phone();
    pc.refuse = () => "That category no longer exists";
    expect(await s.submit(entry(), labels)).toEqual({ kind: "rejected", error: "That category no longer exists" });
    expect(state().entries).toEqual([]);
  });

  it("is on the phone's storage BEFORE it is sent, so an app killed mid-send loses nothing", async () => {
    const store = memoryStore();
    const { post } = pretendPc();
    const storedAtSendTime: number[] = [];
    const s = createOfflineStore({
      store,
      // look at the phone's storage from inside the request, while the entry is "in flight"
      post: async (entries, options) => {
        storedAtSendTime.push((await store.list()).length);
        return post(entries, options);
      },
      probe: async () => true,
      later: () => {},
    });
    await s.submit(entry(), labels);
    expect(storedAtSendTime).toEqual([1]);
  });

  it("without storage on the phone, says so and lets the form save directly", async () => {
    const { s, state } = phone({}, null);
    expect(state().available).toBe(false);
    expect(await s.submit(entry(), labels)).toEqual({ kind: "unavailable" });
  });
});

describe("when the PC comes back", () => {
  it("sends what was kept, oldest first, refreshes the screen, and says it is back", async () => {
    const { s, pc, hooks, state } = phone();
    pc.up = false;
    const [a, b, c] = [entry(), entry(), entry()];
    for (const e of [a, b, c]) await s.submit(e, labels);
    pc.up = true;
    await s.check();
    expect([...pc.saved.keys()]).toEqual([a.clientId, b.clientId, c.clientId]);
    expect(state().entries).toEqual([]);
    expect(state()).toMatchObject({ connection: "online", sent: { count: 3 } });
    expect(hooks.onReconnected).toHaveBeenCalledTimes(1);
    expect(hooks.onSaved).toHaveBeenCalled();
  });

  it("remembers when the PC was last there", async () => {
    const { s, hooks, state } = phone();
    await s.check();
    expect(hooks.writeLastOnline).toHaveBeenCalledWith(state().lastOnlineAt);
    expect(state().lastOnlineAt).not.toBeNull();
  });

  it("does nothing to a PC that is still gone", async () => {
    const { s, pc, state } = phone();
    pc.up = false;
    await s.submit(entry(), labels);
    await s.check();
    expect(state().connection).toBe("offline");
    expect(pending(state())).toHaveLength(1);
  });

  it("survives closing the app: a new store over the same storage finds the entries and sends them", async () => {
    const store = memoryStore();
    const first = phone({}, store);
    first.pc.up = false;
    const e = entry();
    await first.s.submit(e, labels);
    const second = phone({}, store); // the app, opened again
    await second.s.load();
    expect([...second.pc.saved.keys()]).toEqual([e.clientId]);
    expect(await store.list()).toEqual([]);
  });

  it("picks up changes another window of the app made to the outbox", async () => {
    const store = memoryStore();
    const { s, state } = phone({}, store);
    await s.load();
    await store.put({ entry: entry(), labels, queuedAt: 5, status: "failed", error: "x", attempts: 1 });
    await s.check();
    expect(failed(state())).toHaveLength(1);
  });
});

describe("an entry the PC refuses", () => {
  async function oneFailed() {
    const t = phone();
    t.pc.up = false;
    const good = entry();
    const bad = entry({ categoryId: 99 });
    await t.s.submit(bad, labels);
    await t.s.submit(good, labels);
    t.pc.refuse = (e) => (e.categoryId === 99 ? "That category no longer exists" : null);
    t.pc.up = true;
    await t.s.check();
    return { ...t, good, bad };
  }

  it("is kept, marked failed with the PC's reason, while everything else goes through", async () => {
    const { state, pc, good, bad } = await oneFailed();
    expect([...pc.saved.keys()]).toEqual([good.clientId]);
    expect(state().entries).toHaveLength(1);
    expect(state().entries[0]).toMatchObject({ status: "failed", error: "That category no longer exists", attempts: 1, entry: { clientId: bad.clientId } });
  });

  it("is never resent behind your back", async () => {
    const { s, pc } = await oneFailed();
    pc.calls.length = 0;
    await s.check();
    await s.check();
    expect(pc.calls).toEqual([]);
  });

  it("is sent again, as it was, when you tap Retry; and gone once the PC accepts it", async () => {
    const { s, pc, state, bad } = await oneFailed();
    pc.refuse = () => null; // the category came back
    await s.retry(bad.clientId);
    expect(state().entries).toEqual([]);
    expect(pc.saved.has(bad.clientId)).toBe(true);
  });

  it("stays failed, with the new reason, if Retry is refused again", async () => {
    const { s, pc, state, bad } = await oneFailed();
    pc.refuse = () => "Still no";
    await s.retry(bad.clientId);
    expect(state().entries[0]).toMatchObject({ status: "failed", error: "Still no", attempts: 2 });
  });

  it("can be corrected and sent again: the same entry, so nothing is doubled", async () => {
    const { s, pc, state, bad } = await oneFailed();
    s.startEdit(bad.clientId);
    expect(state().editingId).toBe(bad.clientId);
    const fixed = { ...bad, categoryId: 5, item: "Teh tarik, corrected" };
    expect(await s.update(bad.clientId, fixed, labels)).toEqual({ kind: "saved" });
    expect(state()).toMatchObject({ entries: [], editingId: null });
    expect(pc.saved.get(bad.clientId)).toMatchObject({ categoryId: 5, item: "Teh tarik, corrected" });
    expect(pc.saved.size).toBe(2);
  });

  it("stays in the form, and failed, if the correction is refused too", async () => {
    const { s, state, pc, bad } = await oneFailed();
    pc.refuse = () => "Not that either";
    s.startEdit(bad.clientId);
    expect(await s.update(bad.clientId, { ...bad, categoryId: 7 }, labels)).toEqual({ kind: "rejected", error: "Not that either" });
    expect(state().editingId).toBe(bad.clientId);
    expect(state().entries[0]).toMatchObject({ status: "failed", error: "Not that either", entry: { categoryId: 7 } });
  });

  it("a correction made while the PC is gone is kept to send later, and editing ends", async () => {
    const { s, state, pc, bad } = await oneFailed();
    pc.up = false;
    await s.check(); // the phone learns the PC is gone
    s.startEdit(bad.clientId);
    expect(await s.update(bad.clientId, { ...bad, categoryId: 5 }, labels)).toEqual({ kind: "queued", why: "unreachable" });
    expect(state().editingId).toBeNull();
    expect(state().entries[0]).toMatchObject({ status: "pending", error: null, entry: { categoryId: 5 } });
    pc.up = true;
    pc.refuse = () => null;
    await s.check();
    expect(state().entries).toEqual([]);
  });

  it("can be thrown away", async () => {
    const { s, state, bad } = await oneFailed();
    s.startEdit(bad.clientId);
    await s.discard(bad.clientId);
    expect(state()).toMatchObject({ entries: [], editingId: null });
  });

  it("Retry all sends every failed entry again", async () => {
    const t = phone();
    t.pc.refuse = () => "no";
    t.pc.up = false;
    await t.s.submit(entry(), labels);
    await t.s.submit(entry(), labels);
    t.pc.up = true;
    await t.s.check();
    expect(failed(t.state())).toHaveLength(2);
    t.pc.refuse = () => null;
    await t.s.retryAll();
    expect(t.state().entries).toEqual([]);
    expect(t.pc.saved.size).toBe(2);
  });
});

describe("when the PC answers, but not with a verdict", () => {
  it("asking for the PIN again: nothing is lost or failed, the phone says to sign in, and it recovers", async () => {
    const { s, pc, state } = phone();
    pc.login = true;
    expect(await s.submit(entry(), labels)).toEqual({ kind: "queued", why: "login" });
    await s.check();
    expect(state()).toMatchObject({ needsLogin: true, connection: "online" });
    expect(pending(state())).toHaveLength(1);
    expect(failed(state())).toHaveLength(0);
    pc.login = false;
    await s.check();
    expect(state()).toMatchObject({ needsLogin: false, entries: [] });
  });

  it("an error from the PC: entries keep waiting, the status is shown, and it recovers", async () => {
    const { s, pc, state } = phone();
    pc.errorStatus = 500;
    expect(await s.submit(entry(), labels)).toEqual({ kind: "queued", why: "error" });
    expect(state().serverError).toBe(500);
    pc.errorStatus = 0;
    await s.check();
    expect(state()).toMatchObject({ serverError: null, entries: [] });
  });
});

describe("never twice", () => {
  it("a reply lost on the way back doesn't double the entry: the PC says 'already have it'", async () => {
    const { s, pc, state } = phone();
    pc.dropNextReply = true; // the PC saves it; the phone hears nothing
    const e = entry();
    expect(await s.submit(e, labels)).toEqual({ kind: "queued", why: "unreachable" });
    expect(pc.saved.size).toBe(1);
    expect(pending(state())).toHaveLength(1);
    await s.check();
    expect(state().entries).toEqual([]);
    expect(pc.saved.size).toBe(1);
  });

  it("many things asking to send at once make one pass, and a Retry tapped mid-send goes out straight afterwards", async () => {
    const store = memoryStore();
    const failedBefore = entry();
    const waiting = entry();
    await store.put({ entry: failedBefore, labels, queuedAt: 1, status: "failed", error: "no", attempts: 1 });

    // A slow PC: it holds its reply to the first request until told.
    let hold = false;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const post = vi.fn(async (entries: WireEntry[]) => {
      if (hold) {
        hold = false;
        await gate;
      }
      return { kind: "results" as const, results: entries.map((e) => ({ clientId: e.clientId, status: "saved" as const })) };
    });
    const s = createOfflineStore({ store, post, probe: async () => true, now: () => (clock += 10) });
    await s.load(); // reads the failed entry; nothing is pending, so nothing is sent
    expect(post).not.toHaveBeenCalled();

    hold = true;
    await store.put({ entry: waiting, labels, queuedAt: 2, status: "pending", error: null, attempts: 0 });
    const firstPass = s.check(); // sends `waiting`... and is held at the gate
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    const retrying = s.retry(failedBefore.clientId); // tapped while that send is still in flight
    const alsoAsked = s.syncNow(); // and something else asks too
    release();
    await Promise.all([firstPass, retrying, alsoAsked]);

    const sent = post.mock.calls.map((call) => call[0].map((e) => e.clientId));
    expect(sent).toEqual([[waiting.clientId], [failedBefore.clientId]]); // each entry sent exactly once, the retry in the second go
    expect(s.getSnapshot().entries).toEqual([]);
  });
});

describe("the engine", () => {
  const stored = (e: WireEntry, queuedAt: number) => ({ entry: e, labels, queuedAt, status: "pending" as const, error: null, attempts: 0 });

  it("sends in batches and files every verdict", async () => {
    const store = memoryStore();
    const all = Array.from({ length: 60 }, (_, i) => entry({ amount: 100 + i }));
    for (const [i, e] of all.entries()) await store.put(stored(e, i));
    const batches: number[] = [];
    const report = await syncOutbox({
      store,
      post: async (entries) => {
        batches.push(entries.length);
        return { kind: "results", results: entries.map((e) => ({ clientId: e.clientId, status: e.amount % 2 ? ("rejected" as const) : ("saved" as const), error: "odd" })) };
      },
    });
    expect(batches).toEqual([25, 25, 10]);
    expect(report).toMatchObject({ saved: 30, rejected: 30, stopped: null });
    expect((await store.list()).every((e) => e.status === "failed" && e.error === "odd")).toBe(true);
  });

  it("leaves an entry the PC didn't mention waiting", async () => {
    const store = memoryStore();
    const [a, b] = [entry(), entry()];
    await store.put(stored(a, 1));
    await store.put(stored(b, 2));
    await syncOutbox({ store, post: async () => ({ kind: "results", results: [{ clientId: a.clientId, status: "saved" }] }) });
    expect((await store.list()).map((e) => [e.entry.clientId, e.status])).toEqual([[b.clientId, "pending"]]);
  });

  it("stops at the first batch the PC doesn't answer, keeping what already went and leaving the rest waiting", async () => {
    const store = memoryStore();
    for (let i = 0; i < 30; i++) await store.put(stored(entry(), i));
    let calls = 0;
    const report = await syncOutbox({
      store,
      post: async (entries) => (++calls === 1 ? { kind: "results", results: entries.map((e) => ({ clientId: e.clientId, status: "saved" as const })) } : { kind: "unreachable" }),
    });
    expect(report).toMatchObject({ saved: 25, stopped: "unreachable" });
    expect(await store.list()).toHaveLength(5);
  });

  it("reports an error status and a request for the PIN, and touches nothing", async () => {
    const store = memoryStore();
    await store.put(stored(entry(), 1));
    expect(await syncOutbox({ store, post: async () => ({ kind: "error", status: 502 }) })).toMatchObject({ stopped: "error", errorStatus: 502 });
    expect(await syncOutbox({ store, post: async () => ({ kind: "login" }) })).toMatchObject({ stopped: "login" });
    expect((await store.list())[0]).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("does not run when another window of the app is already sending", async () => {
    const { s, pc, state } = phone({ exclusive: async () => {} });
    pc.up = false;
    await s.submit(entry(), labels);
    pc.up = true;
    pc.calls.length = 0;
    await s.check();
    expect(pc.calls).toEqual([]);
    expect(pending(state())).toHaveLength(1);
  });
});

describe("a page that is a saved copy", () => {
  it("knows it is one, and from when, from the moment the app starts", () => {
    const { state } = phone({ readSavedCopyAt: () => 1_700_000_000_000 });
    expect(state().savedCopyAt).toBe(1_700_000_000_000);
  });

  it("is refreshed (and stops being a copy) as soon as the PC answers, even if it was there all along", async () => {
    const clear = vi.fn();
    const { s, hooks, state } = phone({ readSavedCopyAt: () => 5, clearSavedCopyMarker: clear });
    await s.check(); // the PC is up: the copy is stale
    expect(state().savedCopyAt).toBeNull();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(hooks.onReconnected).toHaveBeenCalledTimes(1);
    await s.check(); // nothing stale any more: no second refresh
    expect(hooks.onReconnected).toHaveBeenCalledTimes(1);
  });

  it("stays a copy while the PC can't be reached", async () => {
    const { s, pc, hooks, state } = phone({ readSavedCopyAt: () => 5 });
    pc.up = false;
    await s.check();
    expect(state()).toMatchObject({ savedCopyAt: 5, connection: "offline" });
    expect(hooks.onReconnected).not.toHaveBeenCalled();
  });

  it("is an ordinary page, with no marker, when it came from the PC", () => {
    expect(phone().state().savedCopyAt).toBeNull();
  });
});

describe("the 'sent' notice", () => {
  it("is up for a few seconds, then goes", async () => {
    const { s, scheduled, state } = phone();
    await s.submit(entry(), labels);
    expect(state().sent).toMatchObject({ count: 1 });
    expect(scheduled.map((x) => x.ms)).toEqual([6000]);
    scheduled[0].job();
    expect(state().sent).toBeNull();
  });
  it("counts what a background send delivered, and an older timer never wipes a newer notice", async () => {
    const { s, pc, scheduled, state } = phone();
    pc.up = false;
    await s.submit(entry(), labels);
    await s.submit(entry(), labels);
    pc.up = true;
    await s.check();
    expect(state().sent).toMatchObject({ count: 2 });
    await s.submit(entry(), labels); // a newer one
    expect(state().sent).toMatchObject({ count: 1 });
    scheduled[0].job(); // the first notice's timer fires late
    expect(state().sent).toMatchObject({ count: 1 });
    scheduled[scheduled.length - 1].job();
    expect(state().sent).toBeNull();
  });
});

describe("the store as something a screen can watch", () => {
  it("tells listeners about every change, and gives the same snapshot until something changes", async () => {
    const { s } = phone();
    const seen = vi.fn();
    const stop = s.subscribe(seen);
    const before = s.getSnapshot();
    expect(s.getSnapshot()).toBe(before);
    await s.check();
    expect(seen).toHaveBeenCalled();
    expect(s.getSnapshot()).not.toBe(before);
    stop();
    seen.mockClear();
    await s.check();
    expect(seen).not.toHaveBeenCalled();
  });

  it("starts the same on the server as in the first paint of the browser", () => {
    const { s } = phone();
    expect(s.getServerSnapshot()).toMatchObject({ ready: false, connection: "unknown", entries: [], editingId: null });
    expect(s.getServerSnapshot()).toBe(s.getServerSnapshot());
  });
});
