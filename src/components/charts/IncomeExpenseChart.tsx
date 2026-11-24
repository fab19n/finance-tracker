"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { periodName } from "@/lib/analytics/dashboard-text";
import { formatRMWhole } from "@/lib/money";
import { ChartTooltip, compactRM } from "./ChartTooltip";
import { useGradientId, ValuePill } from "./parts";

type Point = { month: string; income: number; expense: number };

type BarShapeProps = { x?: number; y?: number; width?: number; height?: number; index?: number };

/**
 * A pill-shaped column: fully rounded, earlier periods at 60% when the last one is still running, the one in progress at
 * full strength. `hatch` (a pattern id) lays diagonal stripes over the column, so a series is told apart by pattern and
 * not by hue alone.
 */
function pillShape(cls: string, last: number, dimPast: boolean, hatch?: string) {
  const Shape = (p: BarShapeProps) => {
    const { x = 0, y = 0, width = 0, height = 0, index = 0 } = p;
    if (height <= 0) return <g />;
    const r = Math.min(width, height) / 2;
    const dim = dimPast && index !== last ? " viz-bar-past" : "";
    return (
      <g className={dim.trim() || undefined}>
        <rect x={x} y={y} width={width} height={height} rx={r} ry={r} className={cls} />
        {hatch && <rect x={x} y={y} width={width} height={height} rx={r} ry={r} style={{ fill: `url(#${hatch})` }} />}
      </g>
    );
  };
  return Shape;
}

type TickProps = { x?: number | string; y?: number | string; payload?: { value: string; index: number } };

/**
 * Income vs spending per period, compact: no value axis, two dashed gridlines, 13px pill bars 3px apart. Income is a solid
 * bar and Spent is striped, so the two differ by pattern as well as colour. The latest period is at full strength with a
 * pill saying how much was kept; when it is still running (`partial`) its label says "so far" and the earlier ones sit
 * back at 60%. A finished period is not dimmed or called "so far". Labels are month names (a cycle says "cycle"), never
 * "Oct 26", which reads as a day. The page keeps the legend, the table twin and the hover tooltip.
 */
export function IncomeExpenseChart({ data, cycle = false, partial = true }: { data: Point[]; cycle?: boolean; partial?: boolean }) {
  const hatch = useGradientId();
  const last = data.length - 1;
  const cur = last >= 0 ? data[last] : null;
  const viewed = cur?.month ?? "";
  const name = (m: string) => periodName(m, viewed, cycle);
  const kept = cur ? cur.income - cur.expense : 0;
  const pill = cur && (cur.income > 0 || cur.expense > 0) ? (kept >= 0 ? `+${compactRM(kept)} kept` : `${compactRM(-kept)} over`) : null;
  const curName = cur ? `${name(cur.month)}${partial ? " so far" : ""}` : "";
  return (
    <div
      className="h-[160px] w-full"
      role="img"
      aria-label={`Income versus spending by ${cycle ? "pay cycle" : "month"}${
        cur && pill ? `. ${curName}: income ${formatRMWhole(cur.income)}, spent ${formatRMWhole(cur.expense)}, ${pill}` : ""
      }`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart accessibilityLayer={false} data={data} margin={{ top: 28, right: 8, bottom: 12, left: 8 }} barGap={3} barCategoryGap="30%">
          <defs>
            <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" strokeWidth="2" className="stroke-card" />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            interval={0}
            height={34}
            tick={(p: TickProps) => {
              const isNow = p.payload?.index === last;
              return (
                <text x={p.x} y={Number(p.y ?? 0) + 8} textAnchor="middle" className={`viz-tick${isNow ? " viz-tick-now" : ""}`}>
                  <tspan x={p.x}>{name(String(p.payload?.value ?? ""))}</tspan>
                  {isNow && partial && (
                    <tspan x={p.x} dy="12">
                      so far
                    </tspan>
                  )}
                </text>
              );
            }}
          />
          <YAxis hide tickCount={3} domain={[0, "auto"]} />
          <Tooltip
            content={<ChartTooltip labelFormatter={(l) => `${name(String(l))}${String(l) === cur?.month && partial ? " (so far)" : ""}`} />}
            cursor={{ className: "viz-cursor-bar" }}
          />
          <Bar className="viz-bar-income" dataKey="income" name="Income" fill="var(--series-3)" barSize={13} shape={pillShape("viz-bar-income-rect", last, partial)} isAnimationActive={false} />
          <Bar
            className="viz-bar-spent"
            dataKey="expense"
            name="Spent"
            fill="var(--series-2)"
            barSize={13}
            shape={pillShape("viz-bar-spent-rect", last, partial, hatch)}
            label={(p: { x?: number | string; width?: number | string; index?: number }) =>
              pill && p.index === last && p.x !== undefined && p.width !== undefined ? (
                // Right edge a little past the middle of the pair of bars, so it stays inside the chart.
                <ValuePill key="kept" x={Number(p.x) + 20} y={0} text={pill} />
              ) : (
                <g key={p.index} />
              )
            }
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
