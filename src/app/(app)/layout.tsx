import Link from "next/link";
import { Suspense } from "react";
import { KoopangLogo } from "@/components/KoopangLogo";
import { BottomNav, BottomNavView, SidebarNav, SidebarNavView, SidebarSettings, SidebarSettingsView } from "@/components/NavLinks";
import { OfflineProvider } from "@/components/offline/OfflineProvider";
import { SyncBanner } from "@/components/offline/SyncBanner";
import { SyncChip } from "@/components/offline/SyncChip";

/**
 * The shell. The PAGE scrolls (no locked viewport, no inner scroller).
 *  - Phone: no app bar. Each page opens with its own title (PageHeader), and a bottom tab bar holds
 *    Add · Activity · Plan · Dashboard · More.
 *  - Desktop (md and up): a floating 196 px sidebar card with the logo, the same five places and Settings; the sync chip
 *    sits above Settings. (On a phone the sync chip is in the page header.)
 * Each <Suspense> below wraps a piece that reads the pathname (runtime data), with the same piece, no active item, as the
 * fallback.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <OfflineProvider>
      <div className="min-h-dvh pb-24 md:pb-0 md:pl-57">
        <aside className="fixed inset-y-4 left-4 z-20 hidden w-49 flex-col rounded-3xl bg-card px-3 py-5 md:flex">
          <Link href="/" className="mb-4 block px-2.5 pt-1">
            <KoopangLogo height={28} />
          </Link>
          <Suspense fallback={<SidebarNavView pathname="" />}>
            <SidebarNav />
          </Suspense>
          <div className="mt-2 flex flex-col gap-1.5">
            <SyncChip block />
            <Suspense fallback={<SidebarSettingsView pathname="" />}>
              <SidebarSettings />
            </Suspense>
          </div>
        </aside>

        <main className="mx-auto w-full max-w-5xl px-5 py-5 md:px-8 md:py-8">
          <SyncBanner />
          {children}
        </main>

        <Suspense fallback={<BottomNavView pathname="" />}>
          <BottomNav />
        </Suspense>
      </div>
    </OfflineProvider>
  );
}
