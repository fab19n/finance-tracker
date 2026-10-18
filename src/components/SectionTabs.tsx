"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

/**
 * Tab strips for sections that are several pages. A tab is a LINK to a route (not a hidden panel), so every tab is its
 * own URL, back/forward work, and each page still renders on the server. Like the nav bars, the hook lives in the wrapper
 * (behind <Suspense>) and the view is pure.
 *
 * Two looks, both from globals.css: a segmented control (`seg`) for a few short, equal choices (Plan, More), and a row of
 * chips (`chips`) for many or longer ones that scroll sideways on a phone (Settings).
 */
type Tab = { href: string; label: string };
type TabState = Tab & { current: boolean };

export function TabLinks({ tabs, label, variant = "seg" }: { tabs: readonly TabState[]; label: string; variant?: "seg" | "chips" }) {
  const ref = useRef<HTMLElement>(null);
  // A chip that is off to the right (Settings > Appearance & data) is scrolled to the middle on arrival, instead of
  // leaving you to hunt for the one you are on.
  useLayoutEffect(() => {
    const strip = ref.current;
    const active = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (variant === "chips" && strip && active) strip.scrollLeft = Math.max(0, active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2);
  }, [variant]);

  if (variant === "chips") {
    return (
      <nav ref={ref} aria-label={label} className="no-scrollbar relative -mx-5 flex gap-1.5 overflow-x-auto px-5 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.current ? "page" : undefined} className="chip">
            {t.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav ref={ref} aria-label={label} className="seg md:max-w-md">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.current ? "page" : undefined} className="seg-item">
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function TabStrip({ tabs, pathname, label }: { tabs: readonly Tab[]; pathname: string; label: string }) {
  // The longest matching href wins, so "/plan/bills" doesn't also light up "/plan".
  const current = [...tabs].sort((a, b) => b.href.length - a.href.length).find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href;
  return <TabLinks label={label} tabs={tabs.map((t) => ({ ...t, current: t.href === current }))} />;
}

const MORE_TABS = [
  { href: "/insights", label: "Insights" },
  { href: "/invest", label: "Invest" },
  { href: "/settings", label: "Settings" },
] as const;

const PLAN_TABS = [
  { href: "/plan", label: "Overview" },
  { href: "/plan/bills", label: "Bills" },
  { href: "/plan/shared", label: "Shared" },
] as const;

export function MoreTabsView({ pathname }: { pathname: string }) {
  return <TabStrip tabs={MORE_TABS} pathname={pathname} label="More" />;
}
export function PlanTabsView({ pathname }: { pathname: string }) {
  return <TabStrip tabs={PLAN_TABS} pathname={pathname} label="Plan" />;
}

/** Insights · Invest · Settings: what "More" opens. */
export function MoreTabs() {
  return <MoreTabsView pathname={usePathname()} />;
}

/** Overview · Bills · Shared. */
export function PlanTabs() {
  return <PlanTabsView pathname={usePathname()} />;
}
