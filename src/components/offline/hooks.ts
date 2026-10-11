"use client";

import { useSyncExternalStore } from "react";
import { offlineStore } from "@/lib/offline/browser";
import type { OfflineState } from "@/lib/offline/offline-store";

/**
 * The phone's outbox and what it knows about the PC, re-rendering whoever asks as either changes. The server (and the first
 * paint in the browser) sees an empty outbox and an unknown connection, so nothing flickers in or mismatches on hydration.
 */
export function useOfflineState(): OfflineState {
  const store = offlineStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

/** "Sat, 11 Oct, 2:32 pm": when something happened, for a phone in Malaysia. */
export function when(at: number): string {
  return new Date(at).toLocaleString("en-MY", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
