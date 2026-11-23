import { Suspense } from "react";
import { PlanSwipe } from "@/components/plan/PlanSwipe";

/** Every /plan page: swipe sideways to move between Overview, Bills and Shared. The hooks sit behind <Suspense>. */
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={children}>
      <PlanSwipe>{children}</PlanSwipe>
    </Suspense>
  );
}
