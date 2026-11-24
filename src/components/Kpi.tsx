import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { kpiSizeClass } from "@/lib/analytics/dashboard-text";
import { formatRMWhole } from "@/lib/money";

export type Delta = {
  /** signed ratio vs the previous period, e.g. 0.12 for +12% */
  ratio: number | null;
  /** whether going up is good news (income) or bad news (spending) */
  upIsGood: boolean;
  vs: string; // e.g. "vs Sep"
  /** The earlier period's name on its own ("Sep", "Sep cycle"), for "nothing in Sep to compare". */
  prevName?: string;
  /** The change in sen (this period minus the earlier one). When given, the tile says "+RM 80" and the percentage. */
  diff?: number;
};

/** Stat tile: label, proportional-figure value, optional delta with arrow + text (never colour alone). */
export function Kpi({
  label,
  value,
  hint,
  delta,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  delta?: Delta;
  tone?: "default" | "good" | "bad";
}) {
  let deltaEl: React.ReactNode = null;
  if (delta) {
    if (delta.ratio === null) {
      deltaEl = <span className="text-muted">{delta.prevName ? `nothing in ${delta.prevName} to compare` : "nothing to compare yet"}</span>;
    } else {
      const up = delta.ratio > 0.005;
      const down = delta.ratio < -0.005;
      const good = (up && delta.upIsGood) || (down && !delta.upIsGood);
      const bad = (up && !delta.upIsGood) || (down && delta.upIsGood);
      const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
      const pct = `${up ? "+" : ""}${(delta.ratio * 100).toFixed(0)}%`;
      const change = delta.diff !== undefined && (up || down) ? `${delta.diff > 0 ? "+" : "−"}${formatRMWhole(Math.abs(delta.diff))} (${pct})` : pct;
      deltaEl = (
        <>
          <span className={`flex items-center gap-0.5 font-extrabold ${good ? "text-good" : bad ? "text-danger" : "text-muted"}`}>
            <Icon size={14} aria-hidden className="shrink-0" />
            {change}
          </span>
          <span className="block font-bold text-muted">{delta.vs}</span>
        </>
      );
    }
  }
  return (
    <div className="kpi min-w-0">
      <p className="text-[11px] font-extrabold text-muted md:text-xs">{label}</p>
      <p
        className={`num figure mt-0.5 break-words tracking-[-0.02em] md:mt-1 ${kpiSizeClass(value)} ${
          tone === "bad" ? "text-danger" : tone === "good" ? "text-good" : ""
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 min-h-4 text-[11px] font-bold md:mt-1 md:text-xs">{deltaEl ?? <span className="text-muted">{hint}</span>}</p>
    </div>
  );
}
