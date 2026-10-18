import type { ReactNode } from "react";
import { SyncChip } from "@/components/offline/SyncChip";

/**
 * The top of a page: the title and a grey line under it on the left, optional actions on the right. The v2 phone has no
 * app bar, so this is what says where you are. It also carries the sync chip on phones (the desktop sidebar has its own),
 * so "can't reach your PC" and "3 entries waiting" are never out of sight; the chip renders nothing when all is well.
 * The title is the page's one <h1>.
 */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1">
        <h1 className="h-page">{title}</h1>
        {subtitle && <p className="sub mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SyncChip className="md:hidden" />
        {actions}
      </div>
    </div>
  );
}
