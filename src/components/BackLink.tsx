"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ORIGIN_EVENT, originKey, safeBackPath, sectionOf, type Section } from "@/lib/back";

/** The origin lives in sessionStorage, written by NavTracker after the page changes: it says so with an event. */
function subscribe(onChange: () => void) {
  window.addEventListener(ORIGIN_EVENT, onChange);
  return () => window.removeEventListener(ORIGIN_EVENT, onChange);
}
const serverOrigin = () => "";

function readOrigin(section: Section | null): string {
  if (!section) return "";
  try {
    const origin = safeBackPath(sessionStorage.getItem(originKey(section)));
    // Never "back" into the same section: that would be a tab, not the place you came from.
    return origin && sectionOf(origin) !== section ? origin : "";
  } catch {
    return ""; // blocked storage: keep the default
  }
}

/**
 * The round back arrow in a page header. It goes to `href` (the page's parent), except that a page in a More-menu
 * section returns to the page you entered the section from when NavTracker remembered one: Settings opened from an
 * account card goes back to that account, not to More. The remembered page comes from sessionStorage through
 * useSyncExternalStore with a constant server snapshot, so the first paint equals the server's.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  const section = sectionOf(usePathname());
  const origin = useSyncExternalStore(subscribe, () => readOrigin(section), serverOrigin);
  const target = origin || href;
  return (
    <Link href={target} aria-label={origin ? "Back" : label} className="grid size-11 shrink-0 place-items-center rounded-full bg-card text-foreground transition hover:bg-card-subtle">
      <ChevronLeft size={22} strokeWidth={2.4} aria-hidden />
    </Link>
  );
}
