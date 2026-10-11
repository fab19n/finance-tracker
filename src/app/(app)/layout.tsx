import { Settings, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BottomNav, BottomNavView, TopNav, TopNavView } from "@/components/NavLinks";
import { OfflineProvider } from "@/components/offline/OfflineProvider";
import { SyncBanner } from "@/components/offline/SyncBanner";
import { SyncChip } from "@/components/offline/SyncChip";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <OfflineProvider>
      <div className="min-h-dvh pb-24 md:pb-10">
        <header className="sticky top-0 z-10 border-b border-line bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-8 place-items-center rounded-xl bg-accent text-accent-fg">
                <Wallet size={18} />
              </span>
              Money Tracker
            </Link>
            <Suspense fallback={<TopNavView pathname="" />}>
              <TopNav />
            </Suspense>
            <div className="flex items-center gap-2">
              <SyncChip />
              <Link href="/settings" aria-label="Settings" className="rounded-xl p-2 text-muted hover:bg-card">
                <Settings size={20} />
              </Link>
            </div>
          </div>
        </header>
        <SyncBanner />
        <main className="mx-auto w-full max-w-5xl px-4 py-5">
          {children}
        </main>
        <Suspense fallback={<BottomNavView pathname="" />}>
          <BottomNav />
        </Suspense>
      </div>
    </OfflineProvider>
  );
}
