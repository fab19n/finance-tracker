import type { ReactNode } from "react";
import { BACK_TO_MORE, PageHeader } from "@/components/PageHeader";

/**
 * The top of the pages behind the More menu (Insights, Invest): the page header with a back link to /more. These pages
 * used to share an Insights · Invest · Settings strip; the More menu replaces it.
 */
export function MoreHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="space-y-3">
      <PageHeader title={title} subtitle={subtitle} actions={actions} back={BACK_TO_MORE} />
    </header>
  );
}
