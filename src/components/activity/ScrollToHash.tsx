"use client";

import { useEffect } from "react";

/**
 * Brings the row the address points at (`#tx-123`) into view. The browser's own jump needs the element to be showing, and
 * the list has two copies of each row (phone list, desktop table), one of them hidden: this picks the one on screen.
 */
export function ScrollToHash() {
  useEffect(() => {
    const match = /^#tx-(\d{1,12})$/.exec(window.location.hash);
    if (!match) return;
    const candidates = [document.getElementById(`tx-${match[1]}`), document.getElementById(`txd-${match[1]}`)];
    const el = candidates.find((c) => c && c.getClientRects().length > 0);
    el?.scrollIntoView({ block: "center" });
  }, []);
  return null;
}
