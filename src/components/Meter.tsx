type Status = "ok" | "watch" | "over";

const FILL: Record<Status, string> = {
  ok: "bg-good",
  watch: "bg-warn",
  over: "bg-danger",
};

/**
 * A ratio against a limit. The unfilled track is the grey of a row inside a card, the fill carries severity, and the
 * solid tick marks where you "should" be by now. Status is also written out by the caller, so colour is never the only
 * signal.
 */
export function Meter({ used, pace, status }: { used: number; pace?: number; status: Status }) {
  const pct = Math.min(1, Math.max(0, used)) * 100;
  return (
    <div className="relative h-2.5 w-full rounded-full bg-card-subtle" role="meter" aria-valuenow={Math.round(used * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${FILL[status]}`} style={{ width: `${pct}%` }} />
      {pace !== undefined && pace < 1 && (
        <span
          className="absolute -bottom-[3px] -top-[3px] w-0.5 rounded bg-foreground"
          style={{ left: `${Math.min(pace, 1) * 100}%` }}
          title="Where you'd be at an even pace"
        />
      )}
    </div>
  );
}
