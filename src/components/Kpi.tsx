import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export type Delta = {
  /** signed ratio vs the previous period, e.g. 0.12 for +12% */
  ratio: number | null;
  /** whether going up is good news (income) or bad news (spending) */
  upIsGood: boolean;
  vs: string; // e.g. "vs Sep"
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
  hint?: string;
  delta?: Delta;
  tone?: "default" | "good" | "bad";
}) {
  let deltaEl: React.ReactNode = null;
  if (delta) {
    if (delta.ratio === null) {
      deltaEl = <span className="text-muted">no {delta.vs.replace("vs ", "")} data</span>;
    } else {
      const up = delta.ratio > 0.005;
      const down = delta.ratio < -0.005;
      const good = (up && delta.upIsGood) || (down && !delta.upIsGood);
      const bad = (up && !delta.upIsGood) || (down && delta.upIsGood);
      const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
      deltaEl = (
        <span className={`inline-flex items-center gap-0.5 font-medium ${good ? "text-income" : bad ? "text-danger" : "text-muted"}`}>
          <Icon size={14} aria-hidden />
          {up ? "+" : ""}
          {(delta.ratio * 100).toFixed(0)}% <span className="font-normal text-muted">{delta.vs}</span>
        </span>
      );
    }
  }
  return (
    <div className="card !p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p
        className={`num mt-1.5 text-[22px] font-extrabold tracking-[-0.02em] ${
          tone === "bad" ? "text-danger" : tone === "good" ? "text-income" : ""
        }`}
      >
        {value}
      </p>
      <p className="mt-1 min-h-4 text-xs">{deltaEl ?? <span className="text-muted">{hint}</span>}</p>
    </div>
  );
}
