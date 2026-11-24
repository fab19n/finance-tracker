"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { BACK_MARK_KEY, isFreshMark, nextOrigin, ORIGIN_EVENT, originKey, sectionOf } from "@/lib/back";

const LAST = "mt-last-page";

/**
 * Watches page changes and remembers, per More-menu section, the page you entered it from (`mt-origin:<section>` in
 * sessionStorage), so the section's back link can return there (see BackLink). The last page is kept in sessionStorage
 * too, so a reload doesn't forget it. A way BACK is never an entry: a tap on BackLink (it leaves a mark) and the browser's
 * own back/forward (popstate) leave the origins alone, otherwise two sections that link to each other would point at each
 * other for ever. Renders nothing; mounted once in the app layout, behind <Suspense>.
 */
export function NavTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const poppedAt = useRef<number | null>(null);

  useEffect(() => {
    const onPop = () => {
      poppedAt.current = Date.now();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const full = pathname + (search ? `?${search}` : "");
    const popped = isFreshMark(poppedAt.current, Date.now());
    poppedAt.current = null;
    try {
      const marked = isFreshMark(sessionStorage.getItem(BACK_MARK_KEY), Date.now());
      sessionStorage.removeItem(BACK_MARK_KEY);
      const prev = sessionStorage.getItem(LAST);
      const left = prev ? sectionOf(prev) : null;
      const hit = nextOrigin(prev, pathname, { returning: popped || marked, leftOrigin: left ? sessionStorage.getItem(originKey(left)) : null });
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
