import { Settings } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import {
  BottomNav,
  BottomNavView,
  LogoMark,
  PageTitle,
  PageTitleView,
  SidebarNav,
  SidebarNavView,
  SidebarSettings,
  SidebarSettingsView,
} from "@/components/NavLinks";
import { OfflineProvider } from "@/components/offline/OfflineProvider";
import { SyncBanner } from "@/components/offline/SyncBanner";
import { SyncChip } from "@/components/offline/SyncChip";

/**
 * The shell. The PAGE scrolls (no locked viewport, no inner scroller): the bars are sticky/fixed around it.
 *  - Phone: a top bar (logo mark + the page's name, the sync chip when it has something to say, Settings), the page,
 *    and a bottom tab bar (Add · Activity · Plan · Dashboard · More).
 *  - Desktop (md and up): a fixed 228 px sidebar instead of both bars; the sync chip sits in its footer.
 * Each <Suspense> below wraps a piece that reads the pathname (runtime data), with the same piece, no active item, as the
 * fallback.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <OfflineProvider>
      <div className="min-h-dvh pb-24 md:pb-0 md:pl-57">
        <aside className="fixed inset-y-0 left-0 z-20 hidden w-57 flex-col border-r border-line bg-card-subtle px-3 py-5 md:flex">
          <Link href="/" className="mb-5 flex items-center gap-2.5 px-2">
            <LogoMark />
            <span className="text-[15px] font-extrabold tracking-tight">Money Tracker</span>
          </Link>
          <Suspense fallback={<SidebarNavView pathname="" />}>
            <SidebarNav />
          </Suspense>
          <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-3.5">
            <SyncChip block />
            <Suspense fallback={<SidebarSettingsView pathname="" />}>
              <SidebarSettings />
            </Suspense>
          </div>
        </aside>

        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-background/90 px-4 py-2.5 backdrop-blur md:hidden">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <LogoMark size={30} />
            <Suspense fallback={<PageTitleView pathname="" />}>
              <PageTitle />
            </Suspense>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            <SyncChip />
            <Link href="/settings" aria-label="Settings" className="grid size-9 place-items-center rounded-xl text-muted hover:bg-card">
              <Settings size={20} />
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-8 md:py-7">
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
