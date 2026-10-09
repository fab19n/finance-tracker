type Status = "ok" | "watch" | "over";

const FILL: Record<Status, string> = {
  ok: "bg-accent",
  watch: "bg-warn",
  over: "bg-danger",
};

/**
 * A ratio against a limit. The unfilled track is a lighter step of the ramp, the fill carries
 * severity, and the thin tick marks where you "should" be by now. Status is also written out
 * by the caller, so colour is never the only signal.
 */
export function Meter({ used, pace, status }: { used: number; pace?: number; status: Status }) {
  const pct = Math.min(1, Math.max(0, used)) * 100;
  return (
    <div className="relative h-2 w-full rounded-full bg-line" role="meter" aria-valuenow={Math.round(used * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${FILL[status]}`} style={{ width: `${pct}%` }} />
      {pace !== undefined && pace < 1 && (
        <span
          className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/60"
          style={{ left: `${Math.min(pace, 1) * 100}%` }}
          title="Where you'd be at an even pace"
        />
      )}
    </div>
  );
}
