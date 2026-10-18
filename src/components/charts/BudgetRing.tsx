type Status = "ok" | "watch" | "over";

const STROKE: Record<Status, string> = { ok: "stroke-good", watch: "stroke-warn", over: "stroke-danger" };
const TEXT: Record<Status, string> = { ok: "text-good", watch: "text-warn", over: "text-danger" };

const R = 30;
const C = 2 * Math.PI * R; // 188.5

/**
 * A budget as a ring (the phone's version of the bar meter): the arc is how much of the budget is used, filled in the
 * status colour, and the figure in the middle says it in words, so colour is never the only signal. Over 100% shows a full
 * ring with the real percentage. The classes read the theme through the tokens (var() would not resolve in SVG attributes).
 */
export function BudgetRing({ used, status }: { used: number; status: Status }) {
  const dash = Math.min(1, Math.max(0, used)) * C;
  return (
    <div className="relative size-[72px]">
      <svg viewBox="0 0 72 72" className="size-[72px] -rotate-90" aria-hidden>
        <circle cx="36" cy="36" r={R} fill="none" strokeWidth="7" className="stroke-card-subtle" />
        <circle cx="36" cy="36" r={R} fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${dash} ${C}`} className={STROKE[status]} />
      </svg>
      <span className={`absolute inset-0 grid place-items-center text-[13px] font-black ${TEXT[status]}`}>{Math.round(used * 100)}%</span>
    </div>
  );
}
