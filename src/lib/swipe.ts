/**
 * Swiping between the tabs of a page. Pure: numbers in, a decision out.
 *
 * A swipe counts only when it is clearly sideways (much more across than down, so scrolling the page never switches
 * tab), long enough not to be a tap or a jitter, and quick enough not to be a slow drag (text selection, a slider).
 */
export const SWIPE_MIN_PX = 70;
export const SWIPE_MAX_MS = 700;
export const SWIPE_RATIO = 1.8;

/** -1: the finger moved left (go to the NEXT tab), +1: moved right (go to the PREVIOUS tab), 0: not a swipe. */
export function swipeDirection(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (ms > SWIPE_MAX_MS) return 0;
  if (Math.abs(dx) < SWIPE_MIN_PX) return 0;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return 0;
  return dx < 0 ? -1 : 1;
}

/** The tab a swipe leads to, or null at either end (the first tab has nothing before it, the last nothing after). */
export function neighbourTab(current: number, direction: -1 | 0 | 1, count: number): number | null {
  if (direction === 0 || current < 0 || current >= count) return null;
  const next = direction === -1 ? current + 1 : current - 1;
  return next >= 0 && next < count ? next : null;
}
