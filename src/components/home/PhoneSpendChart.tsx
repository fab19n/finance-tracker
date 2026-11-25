"use client";

import { useRef, useState, type Key, type KeyboardEvent } from "react";
import { ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChartTable } from "@/components/ChartTable";
import { pillWidth, ValuePill } from "@/components/charts/parts";
import { nextRadioIndex } from "@/components/entry/entry-logic";
import { Money } from "@/components/Money";
import type { SpendPoint } from "@/lib/analytics/spend-by-day";
import { shortDate } from "@/lib/dates";
import { formatRM, formatRMWhole } from "@/lib/money";

/** What the chart can draw. The total above it is the same in both. */
const VIEWS = [
  { id: "total", label: "Running total", now: "total", before: "prevTotal" },
  { id: "day", label: "Daily spend", now: "spent", before: "prevSpent" },
] as const;

const HEIGHT = 190;
/** Room above the highest point for the marker's pill. */
const HEADROOM = 40;

type DotProps = { cx?: number; cy?: number; index?: number; key?: Key | null };

/**
 * Home's spending chart on a phone, drawn straight on the page: the total in the middle, then this period as a solid gold
 * line and the last one as a dotted grey one, edge to edge with no grid. A marker (dot, a thin line down, a value) sits on
 * the latest day; a tap or a sideways drag moves it to any day so far. A switch under the chart changes what the lines show,
 * running total or each day's spending, and "View as table" follows it. (From md up, Home keeps its chart in a card.)
 */
export function PhoneSpendChart({
  data,
  label,
  total,
  pace,
  unit,
  thisName,
  lastName,
  className = "",
}: {
  data: SpendPoint[];
  /** "Spent so far", or "Spent" for a finished period. */
  label: string;
  /** Sen: all of this period's spending. */
  total: number;
  /** "Slower than Sep" and its tone, for the period in progress. */
  pace: { cls: string; text: string } | null;
  unit: "cycle" | "month";
  thisName: string;
  lastName: string;
  className?: string;
}) {
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("total");
  const [picked, setPicked] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = VIEWS.find((v) => v.id === view)!;

  const reach = data.reduce((last, p, i) => (p.spent !== null ? i : last), -1);
  const at = picked === null ? reach : Math.min(picked, reach);
  // The lines run to both edges. Only when this period's line reaches the very last day does its marker need room there
  // (a day short of it already leaves more than the dot's radius).
  const endRoom = reach === data.length - 1 ? 10 : 0;
  const hasLast = data.some((p) => (p.prevTotal ?? 0) > 0);

  const point = at >= 0 ? data[at] : null;
  const amount = point ? (view === "total" ? formatRMWhole(point.total!) : formatRM(point.spent!)) : "";
  // A day's own amount needs its date; the running total's latest figure is "now" and needs none.
  const marked = point ? (view === "day" || at !== reach ? `${shortDate(point.date!)} · ${amount}` : amount) : "";

  /** Mark the day under a tap or a drag, never past the last day reached. */
  function move(e: { clientX: number; currentTarget: HTMLDivElement }) {
    if (reach < 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const day = Math.round(((e.clientX - box.left) / Math.max(1, box.width - endRoom)) * (data.length - 1));
    setPicked(Math.min(reach, Math.max(0, day)));
  }

  // A radio group: one stop in the Tab order (the chosen one), the arrow keys move and choose, Home and End jump.
  function onKey(e: KeyboardEvent, index: number) {
    const next = nextRadioIndex(e.key, index, VIEWS.length);
    if (next === null) return;
    e.preventDefault();
    setView(VIEWS[next].id);
    buttons.current[next]?.focus();
  }

  const marker = ({ cx, cy, index, key }: DotProps) => {
    if (index !== at || cx === undefined || cy === undefined) return <g key={key ?? index} />;
    const w = pillWidth(marked);
    // The pill is centred on its day, and kept whole at either edge of the screen.
    const left = Math.max(4, Math.min(cx - w / 2, (width || cx + w) - w - 4));
    return (
      <g key="marker">
        <line x1={cx} x2={cx} y1={cy} y2={HEIGHT - 2} className="viz-marker-line" />
        <circle cx={cx} cy={cy} r={10} className="viz-halo" />
        <circle cx={cx} cy={cy} r={4.5} className="viz-dot" />
        <ValuePill x={left + w / 2} y={cy - 34} text={marked} anchor="middle" minLeft={4} />
      </g>
    );
  };

  const cell = (sen: number | null) => (sen === null ? "–" : formatRM(sen));

  return (
    <section className={`text-center ${className}`} aria-labelledby="spend-phone">
      <h2 id="spend-phone" className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
        {label}
      </h2>
      <p className="num mt-1 font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">
        <Money sen={total} />
      </p>
      {pace && (
        <p className="mt-1.5">
          <span className={`pill ${pace.cls}`}>{pace.text}</span>
        </p>
      )}

      {/* Edge to edge: the page's own side padding is taken back. A sideways drag moves the marker; up and down still scrolls. */}
      <div
        className="-mx-5 mt-1 touch-pan-y select-none"
        style={{ height: HEIGHT }}
        role="img"
        aria-label={`${shown.label}, ${thisName}${hasLast ? ` versus ${lastName}` : ""}${point ? `. ${shortDate(point.date!)}: ${amount}` : ""}`}
        onPointerMove={move}
        onClick={move}
        onPointerLeave={(e) => e.pointerType === "mouse" && setPicked(null)}
      >
        <ResponsiveContainer width="100%" height="100%" onResize={(w) => setWidth(w)}>
          <ComposedChart accessibilityLayer={false} data={data} margin={{ top: HEADROOM, right: endRoom, bottom: 6, left: 0 }}>
            <XAxis dataKey="day" type="number" domain={[1, data.length]} hide />
            <YAxis hide domain={[0, "auto"]} />
            <Line
              className="viz-line-previous"
              type="monotone"
              dataKey={shown.before}
              stroke="var(--series-gray)"
              strokeWidth={1.8}
              strokeLinecap="round"
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              className="viz-line-current"
              type="monotone"
              dataKey={shown.now}
              stroke="var(--series-2)"
              strokeWidth={2.6}
              strokeLinecap="round"
              dot={marker}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11.5px] font-semibold" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="h-[3px] w-3.5 rounded bg-series-2" aria-hidden /> This {unit}
        </li>
        {hasLast && (
          <li className="flex items-center gap-1.5 text-muted">
            <span className="w-3.5 border-t-2 border-dotted border-ink-muted" aria-hidden /> Last {unit}
          </li>
        )}
      </ul>

      <div role="radiogroup" aria-label="What the chart shows" className="seg mx-auto mt-3 max-w-80">
        {VIEWS.map((v, i) => (
          <button
            key={v.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={view === v.id}
            tabIndex={view === v.id ? 0 : -1}
            onClick={() => setView(v.id)}
            onKeyDown={(e) => onKey(e, i)}
            className="seg-item"
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="text-left [&_summary]:justify-center">
        <ChartTable
          caption={view === "total" ? `Running total of spending by day of the ${unit}` : `Spending on each day of the ${unit}`}
          columns={["Day", thisName, lastName]}
          rows={data.map((p) => [p.date ? `${p.day} · ${shortDate(p.date)}` : p.day, cell(p[shown.now]), cell(p[shown.before])])}
        />
      </div>
    </section>
  );
}
