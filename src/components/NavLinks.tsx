"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DuoIcon, type DuoName } from "@/components/DuoIcon";

/**
 * The tab bar: Home (the Dashboard, the landing page), Activity, a larger centre Add button, Accounts, More. Plan,
 * Shared bills, Insights, Invest, Import and Settings sit behind More (/more lists them).
 */
const LEFT = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/transactions", label: "Activity", icon: "activity" },
] as const;
const RIGHT = [
  { href: "/accounts", label: "Accounts", icon: "accounts" },
  { href: "/more", label: "More", icon: "more" },
] as const;

/** Pages reached from the More menu: More stays lit on all of them. */
const MORE_HREFS = ["/more", "/plan", "/insights", "/invest", "/settings", "/import"] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
/** Which tab is lit. The desktop sidebar pins its own Settings link, so it passes withSettings=false. */
function activeTab(pathname: string, withSettings = true): string | null {
  if (MORE_HREFS.some((h) => (withSettings || h !== "/settings") && isActive(pathname, h))) return "/more";
  return [...LEFT, ...RIGHT].find((i) => isActive(pathname, i.href))?.href ?? (pathname === "/" ? "/" : null);
}

/** aria-current: "page" when this IS the page; "true" when the page only sits under this tab (Plan under More). */
function current(href: string, pathname: string, active: boolean): "page" | "true" | undefined {
  return active ? (pathname === href ? "page" : "true") : undefined;
}

function Tab({ href, label, icon, active, pathname }: { href: string; label: string; icon: DuoName; active: boolean; pathname: string }) {
  return (
    <Link href={href} aria-current={current(href, pathname, active)} className={`flex min-h-[54px] flex-col items-center justify-end gap-[3px] pb-0.5 text-[11px] font-bold ${active ? "text-nav-strong" : "text-nav-fg"}`}>
      <span className={`grid h-7 w-[42px] place-items-center rounded-full ${active ? "bg-accent text-accent-fg" : ""}`}>
        <DuoIcon name={icon} size={21} aria-hidden />
      </span>
      {label}
    </Link>
  );
}

/**
 * Presentation only. `usePathname()` is runtime data (on dynamic routes like /transactions/[id] it can't be known at
 * prerender time), so the hook lives in the wrappers below, behind <Suspense>. The fallback renders these views with no
 * active tab, so the bars never flash empty.
 *
 * Five equal slots on a floating deep-green pill. The centre slot is Add: a 56 px gold button that rises out of the bar
 * (the ring in the page colour cuts a notch), labelled like the others; on the Add page it gets a second gold ring.
 */
export function BottomNavView({ pathname }: { pathname: string }) {
  const lit = activeTab(pathname);
  const onAdd = lit === "/";
  return (
    <nav aria-label="Main" className="nav-bar fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-20 md:hidden">
      <div className="mx-auto grid h-16 max-w-md grid-cols-[1fr_1fr_66px_1fr_1fr] items-end rounded-[32px] bg-nav-bg px-1.5 pb-[7px]">
        {LEFT.map((i) => (
          <Tab key={i.href} {...i} active={lit === i.href} pathname={pathname} />
        ))}
        <Link href="/" aria-label="Add an entry" aria-current={onAdd ? "page" : undefined} className={`flex flex-col items-center gap-1 text-[11px] font-bold ${onAdd ? "text-nav-strong" : "text-nav-fg"}`}>
          <span
            className={`-mt-6 grid size-14 place-items-center rounded-full bg-accent text-accent-fg ring-[5px] ring-background ${onAdd ? "outline-2 outline-offset-[5px] outline-nav-focus" : ""}`}
          >
            <Plus size={28} strokeWidth={2.6} aria-hidden />
          </span>
          Add
        </Link>
        {RIGHT.map((i) => (
          <Tab key={i.href} {...i} active={lit === i.href} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

function SideLink({ href, active, icon, pathname, children }: { href: string; active: boolean; icon: DuoName; pathname: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current(href, pathname, active)}
      className={`flex min-h-11 items-center gap-3 rounded-full px-3.5 text-sm transition ${
        active ? "bg-accent font-extrabold text-accent-fg" : "font-bold text-nav-fg hover:bg-nav-strong/10 hover:text-nav-strong"
      }`}
    >
      <DuoIcon name={icon} size={22} aria-hidden />
      {children}
    </Link>
  );
}

/** The desktop sidebar's links: a gold Add entry button, then the same places as the tab bar. */
export function SidebarNavView({ pathname }: { pathname: string }) {
  const lit = activeTab(pathname, false);
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1.5">
      <Link
        href="/"
        aria-current={lit === "/" ? "page" : undefined}
        className={`btn-primary mb-2 min-h-[50px] w-full !text-sm !font-extrabold ${lit === "/" ? "outline-2 outline-offset-2 outline-nav-focus" : ""}`}
      >
        <Plus size={22} strokeWidth={2.6} aria-hidden />
        Add entry
      </Link>
      {[...LEFT, ...RIGHT].map(({ href, label, icon }) => (
        <SideLink key={href} href={href} active={lit === href} icon={icon} pathname={pathname}>
          {label}
        </SideLink>
      ))}
    </nav>
  );
}

/**
 * Settings is pinned at the bottom of the sidebar, below the sync chip and a hairline: a 44 px row with its icon, the same
 * gold pill as the other links when it is the current page (so the current page is never shown by colour alone).
 */
export function SidebarSettingsView({ pathname }: { pathname: string }) {
  const active = isActive(pathname, "/settings");
  return (
    <div className="mt-1 border-t border-nav-fg/25 pt-2">
      <SideLink href="/settings" active={active} icon="settings" pathname={pathname}>
        Settings
      </SideLink>
    </div>
  );
}

/** Floating tab bar on phones. */
export function BottomNav() {
  return <BottomNavView pathname={usePathname()} />;
}

/** Links in the desktop sidebar. */
export function SidebarNav() {
  return <SidebarNavView pathname={usePathname()} />;
}

export function SidebarSettings() {
  return <SidebarSettingsView pathname={usePathname()} />;
}
