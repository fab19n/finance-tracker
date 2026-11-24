/**
 * Where "Back" goes. Pure: strings in, strings out.
 *
 * Two jobs:
 *  1. An entry opened from a list returns to THAT list (`?back=`), not the bare current month: `safeBackPath` accepts only
 *     a same-site path, so a crafted link can never send you to another host.
 *  2. A page behind the More menu (Plan, Settings, Import, Insights, Invest) returns to wherever you came from, not always
 *     to More: `sectionOf` says which section a path is in, and `nextOrigin` says when entering one should remember the
 *     page you left. Moving between tabs of the SAME section never changes the remembered origin.
 */

/** A same-site path (`/transactions?month=2026-10`) or null. Rejects other hosts, `//x`, `/\x`, control characters. */
export function safeBackPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v.length === 0 || v.length > 600) return null;
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return null;
  // A #fragment (the row to land on, `#tx-123`) is kept only when it is plain letters, digits, `_` and `-`; anything else
  // after a `#` is dropped, and the path itself is still returned.
  const hash = v.indexOf("#");
  if (hash >= 0) {
    const fragment = v.slice(hash + 1);
    const path = v.slice(0, hash);
    return FRAGMENT.test(fragment) ? v : path.length > 0 ? path : null;
  }
  return v;
}

const FRAGMENT = /^[A-Za-z0-9_-]{1,40}$/;

/** `path` pointing at one element of the page (`#tx-123`), replacing any fragment it had. A fragment that isn't plain is ignored. */
export function withFragment(path: string, id: string): string {
  const bare = path.split("#")[0] ?? path;
  return FRAGMENT.test(id) ? `${bare}#${id}` : bare;
}

/** `href` with the page to come back to. */
export function withBack(href: string, back: string): string {
  const safe = safeBackPath(back);
  if (!safe) return href;
  return `${href}${href.includes("?") ? "&" : "?"}back=${encodeURIComponent(safe)}`;
}

export const SECTIONS = ["plan", "settings", "insights", "invest", "import"] as const;
export type Section = (typeof SECTIONS)[number];

/** Which More-menu section a path belongs to (`/plan/bills` is `plan`), or null for any other page. */
export function sectionOf(pathname: string): Section | null {
  const path = pathname.split("?")[0] ?? "";
  return SECTIONS.find((s) => path === `/${s}` || path.startsWith(`/${s}/`)) ?? null;
}

export const originKey = (section: Section) => `mt-origin:${section}`;

/** Fired on window after the remembered origins change, so a back link already on screen re-reads them. */
export const ORIGIN_EVENT = "mt-origin-change";

/**
 * Called when the page changes: `prev` is the full address (path and query) just left, or null on a first load.
 * Returns what to remember as the origin of the section just entered, or null when nothing changes (a move inside one
 * section, or into a page that has no back link).
 */
export function nextOrigin(
  prev: string | null,
  pathname: string,
  opts: {
    /** The move was a way BACK (a tap on the back arrow, or the browser's own back/forward): never an "entry". */
    returning?: boolean;
    /** The remembered origin of the section being left, if any. */
    leftOrigin?: string | null;
  } = {},
): { section: Section; origin: string } | null {
  const now = sectionOf(pathname);
  if (!now || !prev || opts.returning) return null;
  const was = sectionOf(prev);
  if (was === now) return null;
  // Landing in the section this one was entered from IS the way back, however it was done (a plain link, a gesture the
  // page could not see). Remembering the page just left would make the two sections point at each other for ever.
  const leftOrigin = safeBackPath(opts.leftOrigin);
  if (was && leftOrigin && sectionOf(leftOrigin) === now) return null;
  const origin = safeBackPath(prev);
  return origin ? { section: now, origin } : null;
}

/** sessionStorage key BackLink sets when it is tapped (the time, in ms), and NavTracker consumes after the page changes. */
export const BACK_MARK_KEY = "mt-nav-back";
/** How long a "going back" mark counts. A navigation that never happened must not taint the next, unrelated one. */
export const BACK_MARK_MS = 5000;

/** True when `stamp` (a time in ms, as text or number, or null) is a "going back" mark made within the last few seconds. */
export function isFreshMark(stamp: string | number | null | undefined, now: number): boolean {
  if (stamp === null || stamp === undefined || stamp === "") return false;
  const t = Number(stamp);
  return Number.isFinite(t) && now - t >= 0 && now - t <= BACK_MARK_MS;
}
