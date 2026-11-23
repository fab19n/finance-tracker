"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { SwipeTabs } from "@/components/SwipeTabs";

/** Plan's tabs in order. Overview and Bills keep the account being looked at; shared bills are about people, not accounts. */
const TABS = [
  { href: "/plan", keepQuery: true },
  { href: "/plan/bills", keepQuery: true },
  { href: "/plan/shared", keepQuery: false },
] as const;

/** Swipe between Overview, Bills and Shared. Wraps every /plan page from the Plan layout. */
export function PlanSwipe({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const account = useSearchParams().get("account");
  const query = account ? `?account=${encodeURIComponent(account)}` : "";
  // The longest matching tab wins, so /plan/bills is not also /plan.
  const current = [...TABS].map((t, i) => ({ t, i })).sort((a, b) => b.t.href.length - a.t.href.length).find(({ t }) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.i ?? -1;
  return (
    <SwipeTabs hrefs={TABS.map((t) => (t.keepQuery ? `${t.href}${query}` : t.href))} current={current}>
      {children}
    </SwipeTabs>
  );
}
