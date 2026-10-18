import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { MoreTabs, MoreTabsView } from "@/components/SectionTabs";

/**
 * The top of the pages under "More" (Insights, Invest): the page header, then the Insights · Invest · Settings
 * switcher. The switcher reads the pathname (runtime data), so it sits in its own <Suspense>.
 */
export function MoreHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="space-y-3">
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      <Suspense fallback={<MoreTabsView pathname="" />}>
        <MoreTabs />
      </Suspense>
    </header>
  );
}
