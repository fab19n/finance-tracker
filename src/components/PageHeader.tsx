import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SyncChip } from "@/components/offline/SyncChip";

/**
 * The top of a page: the title and a grey line under it on the left, optional actions on the right. The phone has no
 * app bar, so this is what says where you are. It also carries the sync chip on phones (the desktop sidebar has its own),
 * so "can't reach your PC" and "3 entries waiting" are never out of sight; the chip renders nothing when all is well.
 * The title is the page's one <h1>.
 *
 * `back` puts a round back link before the title: pages reached from the More menu (Plan, Insights, Invest, Settings)
 * return to it, since they no longer have a tab of their own.
 */
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {back && (
          <Link href={back.href} aria-label={back.label} className="grid size-11 shrink-0 place-items-center rounded-full bg-card text-foreground transition hover:bg-card-subtle">
            <ChevronLeft size={22} strokeWidth={2.4} aria-hidden />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="h-page">{title}</h1>
          {subtitle && <p className="sub mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SyncChip className="md:hidden" />
        {actions}
      </div>
    </div>
  );
}

/** The back link every page behind the More menu carries. */
export const BACK_TO_MORE = { href: "/more", label: "Back to More" } as const;
