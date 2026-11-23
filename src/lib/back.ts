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
  return v;
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
export function nextOrigin(prev: string | null, pathname: string): { section: Section; origin: string } | null {
  const now = sectionOf(pathname);
  if (!now || !prev) return null;
  const was = sectionOf(prev);
  if (was === now) return null;
  const origin = safeBackPath(prev);
  return origin ? { section: now, origin } : null;
}
