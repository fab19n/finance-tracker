// What this phone really holds, read from the browser. Thin on purpose: the wording and ordering are in phone.ts.
// Nothing runs at import time (the server renders these modules too).

export const SW_ERROR_KEY = "money-tracker:sw-error";
const PAGES_CACHE_PREFIX = "money-tracker-pages-";
const SAVED_AT_HEADER = "x-saved-at";

/** The saved copies of pages (address with its query, and when public/sw.js took each), or [] where there is no Cache Storage. */
export async function readSavedCopies(): Promise<{ key: string; savedAt: number | null }[]> {
  try {
    if (typeof caches === "undefined") return [];
    const out: { key: string; savedAt: number | null }[] = [];
    for (const name of (await caches.keys()).filter((k) => k.startsWith(PAGES_CACHE_PREFIX))) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        const response = await cache.match(request);
        const at = Number(response?.headers.get(SAVED_AT_HEADER)) || null;
        out.push({ key: url.pathname + url.search, savedAt: at });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Delete every saved page from this phone now (the worker's own copy of the instruction is sent too, by forgetSavedPages). */
export async function deleteSavedCopies(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    for (const name of (await caches.keys()).filter((k) => k.startsWith(PAGES_CACHE_PREFIX))) await caches.delete(name);
  } catch {
    // best effort
  }
}

/** Why the offline helper could not start, if it could not (remembered by ServiceWorkerRegister). */
export function readWorkerError(): string | null {
  try {
    return localStorage.getItem(SW_ERROR_KEY);
  } catch {
    return null;
  }
}

export type PhoneFacts = {
  /** Is the helper that serves saved pages running? null = this browser has none (plain http, or an old browser). */
  worker: "running" | "starting" | "none";
  installed: boolean;
  persisted: boolean | null;
};

export async function readPhoneFacts(): Promise<PhoneFacts> {
  let worker: PhoneFacts["worker"] = "none";
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      worker = reg?.active ? "running" : reg ? "starting" : "none";
    }
  } catch {
    // none
  }
  let installed = false;
  try {
    installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    // unknown: treated as not installed
  }
  let persisted: boolean | null = null;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    // unknown
  }
  return { worker, installed, persisted };
}

/** Ask the browser to keep this site's storage (the outbox, saved pages, import drafts) rather than clear it when space is short. */
export async function askToKeepStorage(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persist?.()) ?? null;
  } catch {
    return null;
  }
}
