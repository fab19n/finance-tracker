const R = 38;
const C = 2 * Math.PI * R; // 238.8

/**
 * Needs / wants / saving as a donut: the text colour, the accent and good, in that order (the three series slots). It is
 * decoration over the legend beside it, which carries every name and figure, so it is hidden from screen readers.
 */
export function NeedWantDonut({ need, want, saved }: { need: number; want: number; saved: number }) {
  const total = need + want + saved;
  const arcs = [
    { v: need, cls: "stroke-series-1" },
    { v: want, cls: "stroke-series-2" },
    { v: saved, cls: "stroke-series-3" },
  ].filter((a) => a.v > 0);
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="size-24 shrink-0" aria-hidden>
      <circle cx="50" cy="50" r={R} fill="none" strokeWidth="14" className="stroke-card-subtle" />
      {total > 0 &&
        arcs.map((a, i) => {
          // A hairline gap between arcs when there is more than one, so neighbours never merge.
          const len = (a.v / total) * C - (arcs.length > 1 ? 1.5 : 0);
          const el = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              strokeWidth="14"
              strokeDasharray={`${Math.max(0, len)} ${C}`}
              strokeDashoffset={-offset}
              className={a.cls}
              transform="rotate(-90 50 50)"
            />
          );
          offset += (a.v / total) * C;
          return el;
        })}
    </svg>
  );
}
