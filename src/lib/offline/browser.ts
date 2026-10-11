import { settingsHref, SETTINGS_TABS } from "@/lib/settings-tabs";
import { createNetwork } from "./network";
import { createOfflineStore, failed, type OfflineStore } from "./offline-store";
import { indexedDbStore } from "./outbox-store";

// Everything here touches the real browser (storage, network, timers, the service worker), so it is kept thin and out of
// the logic in offline-store.ts. Nothing runs at import time: the server renders these modules too.

const LAST_ONLINE_KEY = "money-tracker:last-online";
const LAST_SAVED_KEY = "money-tracker:pages-saved-at";
const SAVE_PAGES_EVERY_MS = 10 * 60_000;
const LOOK_EVERY_MS = 20_000;

/**
 * The pages kept on the phone to read when the PC can't be reached: the tabs, and the pages beneath them. Every Settings
 * tab is its own address (/settings?tab=...), so each is kept: the Data tab holds the theme control, which works without
 * the PC and so must be reachable without it.
 */
export const SAVED_PAGES = [
  "/",
  "/transactions",
  "/plan",
  "/plan/bills",
  "/plan/shared",
  "/dashboard",
  "/insights",
  "/invest",
  ...SETTINGS_TABS.map((t) => settingsHref(t.id)),
];

function readNumber(key: string): number | null {
  try {
    const n = Number(localStorage.getItem(key));
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}
function writeNumber(key: string, n: number) {
  try {
    localStorage.setItem(key, String(n));
  } catch {
    // private mode, or storage full: nothing depends on this
  }
}

const { post, probe } = createNetwork();

async function exclusive(job: () => Promise<void>) {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks) return job();
  // If another window of the app holds the lock it is already sending: skip, don't queue behind it.
  await locks.request("money-tracker-sync", { ifAvailable: true }, async (lock) => {
    if (lock) await job();
  });
}

/** The number on the app's home-screen icon: how many entries the PC refused. A quiet extra; many phones ignore it. */
let badged = -1;
function badge(count: number) {
  if (count === badged || typeof navigator === "undefined") return;
  badged = count;
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    void (count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => {});
  } catch {
    // not supported here
  }
}

/**
 * The service worker waits several seconds for a PC that never answers, once per tap on a tab. Having just found the PC
 * gone (or back), say so, and it waits far less (or the full time) from then on.
 */
let toldWorker: "gone" | "back" | null = null;
function tellWorker(connection: string) {
  const say = connection === "offline" ? "gone" : connection === "online" ? "back" : null;
  if (!say || say === toldWorker || typeof navigator === "undefined") return;
  toldWorker = say;
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: say === "gone" ? "pc-gone" : "pc-back" });
  } catch {
    // no worker here
  }
}

/** Bringing what is on screen up to date is the router's job, which only a component has: the provider hands it over here. */
let refreshScreen = () => {};
export function bindRefresh(refresh: () => void): () => void {
  refreshScreen = refresh;
  return () => {
    if (refreshScreen === refresh) refreshScreen = () => {};
  };
}

let instance: OfflineStore | undefined;
export function offlineStore(): OfflineStore {
  return (instance ??= createOfflineStore({
    store: indexedDbStore(),
    post,
    probe,
    isNetworkUp: () => typeof navigator === "undefined" || navigator.onLine !== false,
    readLastOnline: () => readNumber(LAST_ONLINE_KEY),
    writeLastOnline: (at) => writeNumber(LAST_ONLINE_KEY, at),
    // The service worker stamps a saved copy of a page with when it was saved (public/sw.js).
    readSavedCopyAt: () => (typeof window === "undefined" ? null : ((window as unknown as { __MT_SAVED_AT?: number }).__MT_SAVED_AT || null)),
    clearSavedCopyMarker: () => void delete (window as unknown as { __MT_SAVED_AT?: number }).__MT_SAVED_AT,
    exclusive,
    onSaved: () => refreshScreen(),
    onReconnected: () => refreshScreen(),
    onReachable: () => void savePagesForOffline(),
    onChange: (s) => {
      badge(failed(s).length);
      tellWorker(s.connection);
    },
  }));
}

/**
 * Ask the service worker to keep a fresh copy of every tab (and the scripts they need), so they open without the PC.
 * At most every ten minutes, and only once a worker is running.
 */
export async function savePagesForOffline(force = false) {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (!force && Date.now() - (readNumber(LAST_SAVED_KEY) ?? 0) < SAVE_PAGES_EVERY_MS) return;
    const worker = (await navigator.serviceWorker.getRegistration())?.active;
    if (!worker) return;
    worker.postMessage({ type: "save-pages", urls: SAVED_PAGES });
    writeNumber(LAST_SAVED_KEY, Date.now());
  } catch {
    // best effort
  }
}

/** Locking the app: the copies of your pages on this phone go too. (Entries not yet sent stay: they are not pages.) */
export function forgetSavedPages() {
  try {
    localStorage.removeItem(LAST_SAVED_KEY);
    navigator.serviceWorker?.controller?.postMessage({ type: "forget-pages" });
  } catch {
    // best effort
  }
}

/** Begin watching the PC: now, whenever the phone's network changes or the app comes to the front, and every so often. */
export function startOffline(): () => void {
  const store = offlineStore();
  void store.load();
  const look = () => {
    if (document.visibilityState === "visible") void store.check();
  };
  window.addEventListener("online", look);
  window.addEventListener("offline", look);
  window.addEventListener("focus", look);
  document.addEventListener("visibilitychange", look);
  const timer = setInterval(look, LOOK_EVERY_MS);
  return () => {
    window.removeEventListener("online", look);
    window.removeEventListener("offline", look);
    window.removeEventListener("focus", look);
    document.removeEventListener("visibilitychange", look);
    clearInterval(timer);
  };
}
