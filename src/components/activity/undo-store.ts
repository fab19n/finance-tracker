/** The pending "Entry deleted. Undo" notice, kept in sessionStorage so it survives a page change. Browser only. */
export const UNDO_KEY = "mt-undo";
/** Fired on window when a notice was just stored, so a toast already on screen picks it up. */
export const UNDO_EVENT = "mt-undo-change";

type Stored = { token: string; at: number };

export function rememberUndo(token: string, now = Date.now()): void {
  try {
    sessionStorage.setItem(UNDO_KEY, JSON.stringify({ token, at: now } satisfies Stored));
  } catch {
    // Blocked storage: the entry is still deleted, there is just no undo notice.
  }
  window.dispatchEvent(new Event(UNDO_EVENT));
}

/** Take the stored notice (and forget it). Returns how many ms it still has to live, or null when there is none or it ran out. */
export function takeUndo(ttl: number, now = Date.now()): { token: string; left: number } | null {
  try {
    const raw = sessionStorage.getItem(UNDO_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(UNDO_KEY);
    const v = JSON.parse(raw) as Partial<Stored>;
    if (typeof v.token !== "string" || typeof v.at !== "number") return null;
    const left = ttl - (now - v.at);
    return left > 0 ? { token: v.token, left } : null;
  } catch {
    return null;
  }
}
