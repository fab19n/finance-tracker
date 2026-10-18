"use client";

import { BarChart3, Calendar, Ellipsis, List, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The four everyday places. Everything else (Insights, Invest, Settings) lives under "More". */
const PRIMARY = [
  { href: "/", label: "Add", icon: Plus },
  { href: "/transactions", label: "Activity", icon: List },
  { href: "/plan", label: "Plan", icon: Calendar },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
] as const;

/** Pages that sit under "More": they share one tab strip (see SectionTabs). */
const MORE_HREFS = ["/insights", "/invest", "/settings"] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
const inMore = (pathname: string) => MORE_HREFS.some((h) => isActive(pathname, h));

/**
 * Presentation only. `usePathname()` is runtime data (on dynamic routes like /transactions/[id] it can't be known at
 * prerender time), so the hook lives in the wrappers below, behind <Suspense>. The fallback renders these views with no
 * active tab, so the bars never flash empty.
 */
export function BottomNavView({ pathname }: { pathname: string }) {
  const items = [
    ...PRIMARY.map((i) => ({ ...i, active: isActive(pathname, i.href) })),
    { href: "/insights", label: "More", icon: Ellipsis, active: inMore(pathname) },
  ];
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t-[1.5px] border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="mx-auto flex max-w-md items-start px-1.5 pt-1.5">
        {items.map(({ href, label, icon: Icon, active }) => (
          <li key={label} className="flex-1">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[54px] flex-col items-center gap-1 py-1.5 text-[11px] font-extrabold ${active ? "text-accent-strong" : "text-muted"}`}
            >
              <span className={`grid h-[26px] w-10 place-items-center rounded-full ${active ? "bg-nav-active" : ""}`}>
                <Icon size={16} strokeWidth={2.5} aria-hidden />
              </span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SideLink({ href, active, icon: Icon, children }: { href: string; active: boolean; icon: typeof Settings; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-full px-3.5 py-[11px] text-[13px] font-extrabold transition ${
        active ? "bg-nav-active text-accent-strong" : "text-muted hover:bg-card-subtle hover:text-foreground"
      }`}
    >
      <Icon size={16} strokeWidth={2.5} aria-hidden />
      {children}
    </Link>
  );
}

/** The desktop sidebar's links (the logo and the sync chip around them are laid out by the layout). */
export function SidebarNavView({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1.5">
      {PRIMARY.map(({ href, label, icon }) => (
        <SideLink key={href} href={href} active={isActive(pathname, href)} icon={icon}>
          {label}
        </SideLink>
      ))}
      <SideLink href="/insights" active={isActive(pathname, "/insights") || isActive(pathname, "/invest")} icon={Ellipsis}>
        More
      </SideLink>
    </nav>
  );
}

/** Settings is pinned at the bottom of the sidebar, below the sync chip: plain text, accent when it is the current page. */
export function SidebarSettingsView({ pathname }: { pathname: string }) {
  const active = isActive(pathname, "/settings");
  return (
    <Link
      href="/settings"
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3.5 py-[11px] text-[13px] font-bold transition ${active ? "text-accent-strong" : "text-muted hover:text-foreground"}`}
    >
      Settings
    </Link>
  );
}

/** Fixed bottom bar on phones. */
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
