import { Suspense, type ReactNode } from "react";
import { MoreTabs, MoreTabsView } from "@/components/SectionTabs";

/**
 * The top of the pages under "More" (Insights, Invest): the title, an optional subtitle and actions, then the
 * Insights · Invest · Settings tabs. The title is read by screen readers; on phones the top bar shows it. The tab strip reads
 * the pathname (runtime data), so it sits in its own <Suspense>.
 */
export function MoreHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h-page">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <Suspense fallback={<MoreTabsView pathname="" />}>
        <MoreTabs />
      </Suspense>
    </header>
  );
}
