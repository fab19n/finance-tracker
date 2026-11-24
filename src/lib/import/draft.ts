/**
 * The import review draft: what you have changed so far, kept on THIS device so a reload, a mis-tap or a phone that went
 * to sleep doesn't throw the review away. It is keyed by the statement's fingerprint (a hash of the file), so choosing the
 * same file again offers to resume. The PDF password is never part of it (the type has no place for it). Pure apart from
 * the Storage object it is handed, so it is tested in Node.
 */
export const DRAFT_PREFIX = "money-tracker:import-draft:";
export const DRAFT_LAST_KEY = "money-tracker:import-draft-last";
const VERSION = 1;

export type Draft = {
  v: 1;
  fp: string;
  savedAt: string;
  fileName: string | null;
  accountId: number;
  startDate: string;
  setOpening: boolean;
  filter: "attention" | "all" | "skipped";
  /** The server's preview with its rows taken out (they are in `rows`, with your edits). */
  preview: Record<string, unknown>;
  rows: Record<string, unknown>[];
};

export type DraftStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** A short hash of the statement: the bytes of a file, or the pasted text. */
export async function fingerprint(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", bytes as BufferSource);
    return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // No Web Crypto (an insecure page): a cheap FNV-1a over the bytes, plus the length. Collisions only mean a wrong offer to resume.
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return `f${h.toString(16)}-${bytes.length}`;
}

const KINDS = new Set(["expense", "income", "transfer", "skip"]);

/** The stored text as a draft for this fingerprint, or null when it is missing, damaged or another statement's. */
/** A review nobody came back to is forgotten after two weeks: it holds every line of a bank statement. */
export const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function parseDraft(raw: string | null, fp: string, now: number = Date.now()): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<Draft> | null;
    if (!d || d.v !== VERSION || d.fp !== fp) return null;
    const saved = typeof d.savedAt === "string" ? Date.parse(d.savedAt) : NaN;
    if (!Number.isFinite(saved) || now - saved > DRAFT_MAX_AGE_MS) return null;
    if (typeof d.accountId !== "number" || typeof d.startDate !== "string" || typeof d.setOpening !== "boolean") return null;
    if (d.filter !== "attention" && d.filter !== "all" && d.filter !== "skipped") return null;
    if (!d.preview || typeof d.preview !== "object" || !Array.isArray(d.rows) || d.rows.length === 0) return null;
    for (const r of d.rows) {
      if (!r || typeof r.key !== "string" || typeof r.amount !== "number" || typeof r.index !== "number" || !KINDS.has(r.kind as string)) return null;
    }
    return d as Draft;
  } catch {
    return null;
  }
}

export function saveDraft(store: DraftStore, draft: Draft): boolean {
  try {
    store.setItem(DRAFT_PREFIX + draft.fp, JSON.stringify(draft));
    store.setItem(DRAFT_LAST_KEY, JSON.stringify({ fp: draft.fp, fileName: draft.fileName, savedAt: draft.savedAt }));
    return true;
  } catch {
    return false; // storage full or blocked: the review still works, it just can't be resumed
  }
}

export function loadDraft(store: DraftStore, fp: string): Draft | null {
  try {
    return parseDraft(store.getItem(DRAFT_PREFIX + fp), fp);
  } catch {
    return null;
  }
}

export function clearDraft(store: DraftStore, fp: string): void {
  try {
    store.removeItem(DRAFT_PREFIX + fp);
    const last = JSON.parse(store.getItem(DRAFT_LAST_KEY) ?? "null") as { fp?: string } | null;
    if (last?.fp === fp) store.removeItem(DRAFT_LAST_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Forget every saved review on this device ("Lock now"): they hold statement lines, so they go with the saved pages. */
export function clearAllDrafts(store: DraftStore & Pick<Storage, "length" | "key">): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && (k.startsWith(DRAFT_PREFIX) || k === DRAFT_LAST_KEY)) keys.push(k);
    }
    keys.forEach((k) => store.removeItem(k));
  } catch {
    /* nothing to clear */
  }
}

/** The most recent unfinished review, for "You have an unfinished review of X". */
export function lastDraft(store: DraftStore): { fp: string; fileName: string | null; savedAt: string } | null {
  try {
    const last = JSON.parse(store.getItem(DRAFT_LAST_KEY) ?? "null") as { fp?: unknown; fileName?: unknown; savedAt?: unknown } | null;
    if (!last || typeof last.fp !== "string" || typeof last.savedAt !== "string") return null;
    if (!store.getItem(DRAFT_PREFIX + last.fp)) return null;
    return { fp: last.fp, fileName: typeof last.fileName === "string" ? last.fileName : null, savedAt: last.savedAt };
  } catch {
    return null;
  }
}
