import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { PlanTabs, PlanTabsView } from "@/components/SectionTabs";

/**
 * The top of every Plan page: the page header (with an optional subtitle and actions such as Import), then the
 * Overview · Bills · Shared switcher. The switcher is three links to three routes, so each page is its own URL. It reads
 * the pathname (runtime data), so it sits in its own <Suspense>.
 */
export function PlanHeader({ subtitle, actions, account }: { subtitle?: ReactNode; actions?: ReactNode; account?: number }) {
  return (
    <header className="space-y-3">
      <PageHeader title="Plan" subtitle={subtitle} actions={actions} />
      <Suspense fallback={<PlanTabsView pathname="" account={account} />}>
        <PlanTabs account={account} />
      </Suspense>
    </header>
  );
}
