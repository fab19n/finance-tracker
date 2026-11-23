"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { nextOrigin, ORIGIN_EVENT, originKey, sectionOf } from "@/lib/back";

const LAST = "mt-last-page";

/**
 * Watches page changes and remembers, per More-menu section, the page you entered it from (`mt-origin:<section>` in
 * sessionStorage), so the section's back link can return there (see BackLink). The last page is kept in sessionStorage
 * too, so a reload doesn't forget it. Renders nothing; mounted once in the app layout, behind <Suspense>.
 */
export function NavTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    const full = pathname + (search ? `?${search}` : "");
    try {
      const prev = sessionStorage.getItem(LAST);
      const hit = nextOrigin(prev, pathname);
      if (hit) sessionStorage.setItem(originKey(hit.section), hit.origin);
      // Opened straight into a section (a bookmark, the installed app): there is no page to go back to but More.
      else if (prev === null) {
        const s = sectionOf(pathname);
        if (s) sessionStorage.removeItem(originKey(s));
      }
      sessionStorage.setItem(LAST, full);
      window.dispatchEvent(new Event(ORIGIN_EVENT));
    } catch {
      // Storage can be blocked (private window): the back link then just goes to its default.
    }
  }, [pathname, search]);
  return null;
}
