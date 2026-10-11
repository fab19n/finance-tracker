"use client";

import { BarChart3, CalendarCheck, Ellipsis, Lightbulb, ListOrdered, PlusCircle, Settings, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The four everyday places. Everything else (Insights, Invest, Settings) lives under "More". */
const PRIMARY = [
  { href: "/", label: "Add", icon: PlusCircle },
  { href: "/transactions", label: "Activity", icon: ListOrdered },
  { href: "/plan", label: "Plan", icon: CalendarCheck },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
] as const;

/** Pages that sit under "More": they share one tab strip (see SectionTabs). */
const MORE_HREFS = ["/insights", "/invest", "/settings"] as const;

/** What the phone's top bar says, by section. A page's own <h1> is hidden on phones (see .h-page) because this says it. */
const TITLES: { match: (p: string) => boolean; title: string }[] = [
  { match: (p) => p === "/", title: "Add entry" },
  { match: (p) => p.startsWith("/transactions"), title: "Activity" },
  { match: (p) => p.startsWith("/plan"), title: "Plan" },
  { match: (p) => p.startsWith("/dashboard"), title: "Dashboard" },
  { match: (p) => p.startsWith("/insights"), title: "Insights" },
  { match: (p) => p.startsWith("/invest"), title: "Invest" },
  { match: (p) => p.startsWith("/settings"), title: "Settings" },
  { match: (p) => p.startsWith("/import"), title: "Import" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
const inMore = (pathname: string) => MORE_HREFS.some((h) => isActive(pathname, h));

/** The logo mark: the wallet on the accent colour. Used by the sidebar and the phone's top bar. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[10px] bg-accent text-accent-fg"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Wallet size={Math.round(size * 0.5)} />
    </span>
  );
}

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
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card-subtle pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-start px-1 pt-2">
        {items.map(({ href, label, icon: Icon, active }) => (
          <li key={label} className="flex-1">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[54px] flex-col items-center gap-0.5 text-[11px] font-semibold ${active ? "text-accent" : "text-muted"}`}
            >
              <span className={`grid h-[26px] w-10 place-items-center rounded-full ${active ? "bg-accent-soft" : ""}`}>
                <Icon size={20} strokeWidth={active ? 2.5 : 2} aria-hidden />
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
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition ${
        active ? "bg-accent-soft font-bold text-accent" : "font-medium text-muted hover:bg-background hover:text-foreground"
      }`}
    >
      <Icon size={18} aria-hidden />
      {children}
    </Link>
  );
}

/** The desktop sidebar's links (the logo and the sync chip around them are laid out by the layout). */
export function SidebarNavView({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5">
      {PRIMARY.map(({ href, label, icon }) => (
        <SideLink key={href} href={href} active={isActive(pathname, href)} icon={icon}>
          {label}
        </SideLink>
      ))}
      <SideLink href="/insights" active={isActive(pathname, "/insights") || isActive(pathname, "/invest")} icon={Lightbulb}>
        Insights &amp; More
      </SideLink>
    </nav>
  );
}

/** Settings is pinned at the bottom of the sidebar, below the sync chip. */
export function SidebarSettingsView({ pathname }: { pathname: string }) {
  return (
    <SideLink href="/settings" active={isActive(pathname, "/settings")} icon={Settings}>
      Settings
    </SideLink>
  );
}

export function PageTitleView({ pathname }: { pathname: string }) {
  const title = pathname === "" ? "Money Tracker" : (TITLES.find((t) => t.match(pathname))?.title ?? "Money Tracker");
  // An entry being edited is a page of its own under /transactions.
  const edit = /^\/transactions\/\d+/.test(pathname);
  return <span className="truncate text-[15px] font-extrabold tracking-tight">{edit ? "Edit entry" : title}</span>;
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

/** The page's name, in the phone's top bar. */
export function PageTitle() {
  return <PageTitleView pathname={usePathname()} />;
}
