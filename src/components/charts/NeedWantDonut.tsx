const R = 34;
const STROKE = 11;
const C = 2 * Math.PI * R; // 213.6
const GAP = 3; // a clear gap between arcs, measured between the round caps

/**
 * Needs / wants / saving as the design's 96px ring: an 11px stroke with ROUND caps on a raised track, the text colour, the
 * accent and good (the three series slots), and the share saved in the middle ("20%" in Sora, "saved" under it). It is
 * decoration over the legend beside it, which carries every name and figure, so it is hidden from screen readers.
 */
export function NeedWantDonut({ need, want, saved, savedPct }: { need: number; want: number; saved: number; savedPct?: number }) {
  const total = need + want + saved;
  const arcs = [
    { v: need, cls: "stroke-series-1" },
    { v: want, cls: "stroke-series-2" },
    { v: saved, cls: "stroke-series-3" },
  ].filter((a) => a.v > 0);
  let offset = 0;
  return (
    <div className="relative size-24 shrink-0" aria-hidden>
      <svg viewBox="0 0 96 96" className="size-24">
        <circle cx="48" cy="48" r={R} fill="none" strokeWidth={STROKE} className="stroke-card-subtle" />
        {total > 0 &&
          arcs.map((a, i) => {
            const share = (a.v / total) * C;
            // Round caps add half a stroke at each end, so each arc is drawn shorter by a stroke plus the gap; a lone arc closes the ring.
            const several = arcs.length > 1;
            const len = several ? Math.max(0.01, share - STROKE - GAP) : C;
            const start = several ? offset + (STROKE + GAP) / 2 : 0;
            const el = (
              <circle
                key={i}
                cx="48"
                cy="48"
                r={R}
                fill="none"
                strokeWidth={STROKE}
                strokeLinecap={several ? "round" : "butt"}
                strokeDasharray={`${len} ${C}`}
                strokeDashoffset={-start}
                className={a.cls}
                transform="rotate(-90 48 48)"
              />
            );
            offset += share;
            return el;
          })}
      </svg>
      {savedPct !== undefined && (
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="font-display text-[19px] font-semibold tracking-[-0.02em]">{Math.round(savedPct * 100)}%</span>
          <span className="mt-1 text-[10px] font-bold text-muted">saved</span>
        </div>
      )}
    </div>
  );
}
