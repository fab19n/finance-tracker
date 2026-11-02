"use client";

import { useLayoutEffect, useRef } from "react";
import { scrollLeftToShow } from "@/lib/scroll";

/**
 * Put inside a sideways-scrolling row. When the chosen item (the one marked `aria-current`) is out of sight, as it is on a
 * phone when the fourth account is picked, the row scrolls it to the middle. It moves only the row, never the page
 * (`scrollIntoView` would scroll every ancestor too), and does nothing when the item is already in view, so tapping a
 * visible chip doesn't make the row jump under your thumb. `selected` is only there to run it again when the choice changes.
 * It draws nothing.
 */
export function ScrollChosenIntoView({ selected }: { selected: number | string | null }) {
  const marker = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const row = marker.current?.parentElement;
    const chip = row?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row || !chip) return;
    const left = chip.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
    const target = scrollLeftToShow({ scrollLeft: row.scrollLeft, viewWidth: row.clientWidth, scrollWidth: row.scrollWidth, chipLeft: left, chipWidth: chip.offsetWidth });
    if (target !== null) row.scrollTo({ left: target });
  }, [selected]);
  return <span ref={marker} hidden />;
}
