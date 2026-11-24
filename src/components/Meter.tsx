import { meterAria } from "@/lib/analytics/dashboard-text";

type Status = "ok" | "watch" | "over";

const FILL: Record<Status, string> = {
  ok: "bg-good",
  watch: "bg-warn",
  over: "bg-danger",
};

/**
 * A ratio against a limit. The unfilled track is the grey of a row inside a card, the fill carries severity, and the
 * solid tick marks where you "should" be by now. Status is also written out by the caller, so colour is never the only
 * signal. It has a name (`label`) and a value text that says the real percentage and the even pace, so a screen reader
 * gets what the tick shows; the value itself is held to the scale (130% reads as 100 of 100, "130% used, over budget").
 *
 * `thin` is the design's budget track: 7 px, a gold fill while all is well (`good` only when `settled`, the bills are
 * paid and nothing more is due), danger when over, and a lighter tick.
 */
export function Meter({
  used,
  pace,
  status,
  label,
  thin = false,
  settled = false,
}: {
  used: number;
  pace?: number;
  status: Status;
  label?: string;
  thin?: boolean;
  settled?: boolean;
}) {
  const pct = Math.min(1, Math.max(0, used)) * 100;
  const aria = meterAria(used, pace);
  const fill = thin && status === "ok" ? (settled ? "bg-good" : "bg-accent-strong") : FILL[status];
  return (
    <div
      className={`relative w-full rounded-full bg-card-subtle ${thin ? "h-[7px]" : "h-2.5"}`}
      role="meter"
      aria-label={label ?? "Progress against its limit"}
      aria-valuenow={aria.now}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={aria.text}
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      {pace !== undefined && pace < 1 && (
        <span
          className={`absolute w-0.5 rounded bg-foreground ${thin ? "-bottom-[3.5px] -top-[3.5px] opacity-65" : "-bottom-[3px] -top-[3px]"}`}
          style={{ left: `${Math.min(pace, 1) * 100}%` }}
          title="Where you'd be at an even pace"
          aria-hidden
        />
      )}
    </div>
  );
}
