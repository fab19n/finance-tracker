"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode, type TouchEvent } from "react";
import { neighbourTab, swipeDirection } from "@/lib/swipe";

/** True when a swipe that starts on this element belongs to something else: typing, a dialog, or a row that scrolls sideways. */
function ownsHorizontalGesture(start: EventTarget | null, boundary: HTMLElement): boolean {
  let el = start instanceof HTMLElement ? start : null;
  while (el && el !== boundary) {
    if (el.matches("input, textarea, select, [contenteditable='true'], dialog, [data-no-swipe]")) return true;
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Swipe left or right anywhere on the page to move to the next or previous tab (touch only: a mouse never fires these
 * events). `hrefs` are the tabs in order and `current` the one on screen. A sideways row (the Settings chips), a field, a
 * date picker or an open sheet keeps its own swipe; a mostly-vertical drag is just scrolling. The tab bar's links still
 * work: this adds a gesture, it takes nothing away.
 */
export function SwipeTabs({ hrefs, current, children }: { hrefs: readonly string[]; current: number; children: ReactNode }) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  // Chrome on Android turns a rightward swipe on a page that can't scroll into "go back in history", which would win over
  // "previous tab". While this page is open that browser gesture is switched off (html.swipe-tabs, globals.css).
  useEffect(() => {
    document.documentElement.classList.add("swipe-tabs");
    return () => document.documentElement.classList.remove("swipe-tabs");
  }, []);

  function onStart(e: TouchEvent<HTMLDivElement>) {
    const touch = e.touches[0];
    // One finger only (a pinch is not a swipe), and not on something that scrolls or edits sideways.
    start.current = e.touches.length === 1 && touch && !ownsHorizontalGesture(e.target, e.currentTarget) ? { x: touch.clientX, y: touch.clientY, t: e.timeStamp } : null;
  }
  function onEnd(e: TouchEvent<HTMLDivElement>) {
    const s = start.current;
    start.current = null;
    const touch = e.changedTouches[0];
    if (!s || !touch) return;
    const to = neighbourTab(current, swipeDirection(touch.clientX - s.x, touch.clientY - s.y, e.timeStamp - s.t), hrefs.length);
    if (to !== null && hrefs[to]) router.replace(hrefs[to]); // tabs are one place: the system Back leaves the section, it doesn't walk through every swiped tab
  }

  return (
    <div onTouchStart={onStart} onTouchEnd={onEnd} onTouchCancel={() => (start.current = null)}>
      {children}
    </div>
  );
}
