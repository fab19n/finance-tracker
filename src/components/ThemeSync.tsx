"use client";

import { useLayoutEffect } from "react";
import { applyTheme, readTheme } from "@/lib/theme";

/**
 * Keeps <html data-theme> and the browser's theme colour in line with this device's choice. The inline script in the root
 * layout already sets the attribute before paint on a real page load; this covers the two cases it can't:
 *  - React's dev-mode remount clears attributes it doesn't manage (a no-op in production);
 *  - the theme-color <meta> tags, which Next writes after the script has run.
 * Renders nothing.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme(readTheme());
  }, []);
  return null;
}
