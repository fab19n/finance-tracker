"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { bindRefresh, startOffline } from "@/lib/offline/browser";

/**
 * Watches for the PC for as long as the app is open: asks whether it is there now, whenever the phone's network changes or
 * the app comes to the front, and every so often; sends what is waiting the moment it is. Draws nothing of its own.
 */
export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A send finishing and the PC coming back can both ask for a refresh at once: once is plenty.
    const unbind = bindRefresh(() => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    });
    const stop = startOffline();
    return () => {
      stop();
      unbind();
      clearTimeout(timer);
    };
  }, [router]);
  return children;
}
