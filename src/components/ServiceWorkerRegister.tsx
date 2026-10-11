"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js, which only swaps the browser's error screen for a "can't reach your PC" page.
 * Production only (a service worker in `pnpm dev` would just get in the way of hot reloading), and only where the browser
 * allows one: HTTPS or localhost. Over plain http:// on the home network `serviceWorker` doesn't exist, and nothing happens.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
