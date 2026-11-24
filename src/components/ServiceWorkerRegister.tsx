"use client";

import { useEffect } from "react";
import { SW_ERROR_KEY } from "@/lib/offline/phone-browser";

/**
 * Registers public/sw.js, which only swaps the browser's error screen for a "can't reach your PC" page.
 * Production only (a service worker in `pnpm dev` would just get in the way of hot reloading), and only where the browser
 * allows one: HTTPS or localhost. Over plain http:// on the home network `serviceWorker` doesn't exist, and nothing happens.
 * A failed registration is remembered, so Settings > Appearance & data can say the phone will not open without the PC.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const remember = (message: string | null) => {
      try {
        if (message) localStorage.setItem(SW_ERROR_KEY, message);
        else localStorage.removeItem(SW_ERROR_KEY);
      } catch {
        // storage blocked: nothing depends on it
      }
    };
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => remember(null))
      .catch((e: unknown) => remember(e instanceof Error ? e.message : "The browser refused to start it."));
  }, []);
  return null;
}
