import type { OutboxEntry } from "./types";

/** Where the phone keeps entries that haven't reached the PC. Keyed by the entry's clientId. */
export interface OutboxStore {
  list(): Promise<OutboxEntry[]>;
  put(entry: OutboxEntry): Promise<void>;
  remove(clientId: string): Promise<void>;
}

/** For tests. Copies on the way in and out, as a real database would, so nothing is shared by accident. */
export function memoryStore(): OutboxStore {
  const entries = new Map<string, OutboxEntry>();
  return {
    list: async () => [...entries.values()].map((e) => structuredClone(e)),
    put: async (e) => void entries.set(e.entry.clientId, structuredClone(e)),
    remove: async (id) => void entries.delete(id),
  };
}

const DB_NAME = "money-tracker-outbox";
const STORE = "entries";

/**
 * The phone's own storage (IndexedDB), which survives closing the app, a restart and a flat battery. Null where the browser
 * has none; the form then saves straight to the PC as it always did, and says so if it can't.
 */
export function indexedDbStore(): OutboxStore | null {
  if (typeof indexedDB === "undefined") return null;

  let opened: Promise<IDBDatabase> | null = null;
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "entry.clientId" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));

  async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      // Wait for the transaction, not just the request: only then is a write really on disk.
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }

  return {
    list: () => run("readonly", (s) => s.getAll() as IDBRequest<OutboxEntry[]>),
    put: async (e) => void (await run("readwrite", (s) => s.put(e))),
    remove: async (id) => void (await run("readwrite", (s) => s.delete(id))),
  };
}
