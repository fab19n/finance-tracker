"use client";

import { BarChart3, Lightbulb, ListOrdered, PiggyBank, PlusCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Add", icon: PlusCircle },
  { href: "/transactions", label: "Activity", icon: ListOrdered },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/invest", label: "Invest", icon: PiggyBank },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Presentation only. `usePathname()` is runtime data (on dynamic routes like /transactions/[id] it
 * can't be known at prerender time), so the hook lives in the wrappers below, behind <Suspense>.
 * The fallback renders these views with no active tab, so the bar never flashes empty.
 */
export function BottomNavView({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-md justify-around">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TopNavView({ pathname }: { pathname: string }) {
  return (
    <nav className="hidden gap-1 md:flex">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
              active ? "bg-accent-soft text-accent" : "text-muted hover:bg-background"
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Fixed bottom bar on phones. */
export function BottomNav() {
  return <BottomNavView pathname={usePathname()} />;
}

/** Tab strip in the header on wider screens. */
export function TopNav() {
  return <TopNavView pathname={usePathname()} />;
}
