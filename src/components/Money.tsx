import { formatRM } from "@/lib/money";

/**
 * A money figure the way the design draws it: the ringgit large, the cents small and muted ("RM 2,280" then ".00" at 62%).
 * Server-safe, no hooks. `sen` is integer sen as everywhere (see src/lib/money.ts). The whole text stays one string for
 * a screen reader ("RM 2,280.00"): the cents are only a smaller span, nothing is hidden. A figure with no decimals (a
 * whole-ringgit KPI) is printed as given.
 */
export function Money({ sen, className = "" }: { sen: number; className?: string }) {
  const text = formatRM(sen);
  const dot = text.lastIndexOf(".");
  if (dot < 0) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {text.slice(0, dot)}
      <span className="dec">{text.slice(dot)}</span>
    </span>
  );
}
