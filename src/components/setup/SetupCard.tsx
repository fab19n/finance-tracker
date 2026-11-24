import { SetupChecklist } from "./SetupChecklist";
import { missingSetupSteps, setupProgress, type SetupFacts } from "@/lib/setup";

/** Server wrapper: nothing at all once every step is done. */
export function SetupCard({ facts }: { facts: SetupFacts }) {
  if (missingSetupSteps(facts).length === 0) return null;
  return <SetupChecklist items={setupProgress(facts)} />;
}
