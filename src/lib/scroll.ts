/**
 * Where to scroll a sideways-scrolling row so one item in it can be seen. Pure: the caller measures, this decides.
 * `chipLeft` is the item's left edge measured inside the row's scrollable content (not on screen).
 *
 * Returns null when the item is already fully in view (leave the user's scroll position alone), otherwise the `scrollLeft`
 * that centres it, kept inside what the row can actually scroll.
 */
export function scrollLeftToShow(p: { scrollLeft: number; viewWidth: number; scrollWidth: number; chipLeft: number; chipWidth: number }): number | null {
  const { scrollLeft, viewWidth, scrollWidth, chipLeft, chipWidth } = p;
  if (chipLeft >= scrollLeft && chipLeft + chipWidth <= scrollLeft + viewWidth) return null;
  const centred = chipLeft - (viewWidth - chipWidth) / 2;
  return Math.round(Math.min(Math.max(0, centred), Math.max(0, scrollWidth - viewWidth)));
}
