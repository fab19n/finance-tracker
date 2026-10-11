import { Suspense, type ReactNode } from "react";
import { PlanTabs } from "@/components/SectionTabs";
import { PlanTabsView } from "@/components/SectionTabs";

/**
 * The top of every Plan page: the title (read by screen readers; on phones the top bar shows it), an optional subtitle and
 * actions, then the Overview · Bills · Shared bills tabs. The tabs are links to three routes, so each page is its own URL.
 * The tab strip reads the pathname (runtime data), so it sits in its own <Suspense>.
 */
export function PlanHeader({ subtitle, actions }: { subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="space-y-3">
      <div>
        <h1 className="h-page">Plan</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
      <Suspense fallback={<PlanTabsView pathname="" />}>
        <PlanTabs />
      </Suspense>
    </header>
  );
}
