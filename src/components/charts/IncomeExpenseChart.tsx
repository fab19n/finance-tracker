"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { shortMonthLabel } from "@/lib/dates";
import { ChartTooltip, compactRM } from "./ChartTooltip";
import { ValuePill } from "./parts";

type Point = { month: string; income: number; expense: number };

type BarShapeProps = { x?: number; y?: number; width?: number; height?: number; index?: number };

/** A pill-shaped column: fully rounded, earlier months at 60%, the month in progress at full strength. */
function pillShape(cls: string, last: number) {
  const Shape = (p: BarShapeProps) => {
    const { x = 0, y = 0, width = 0, height = 0, index = 0 } = p;
    if (height <= 0) return <g />;
    const r = Math.min(width, height) / 2;
    return <rect x={x} y={y} width={width} height={height} rx={r} ry={r} className={`${cls}${index === last ? "" : " viz-bar-past"}`} />;
  };
  return Shape;
}

type TickProps = { x?: number | string; y?: number | string; payload?: { value: string; index: number } };

/**
 * Income vs spending per month, compact: no value axis, two dashed gridlines, 13px pill bars 3px apart, earlier months
 * at 60% and the month in progress at full strength (its label in bold ink) with a pill saying how much was kept. The
 * page keeps the legend, the table twin and the hover tooltip.
 */
export function IncomeExpenseChart({ data }: { data: Point[] }) {
  const last = data.length - 1;
  const cur = last >= 0 ? data[last] : null;
  const kept = cur ? cur.income - cur.expense : 0;
  const pill = cur && (cur.income > 0 || cur.expense > 0) ? (kept >= 0 ? `+${compactRM(kept)} kept` : `${compactRM(-kept)} over`) : null;
  return (
    <div
      className="h-[150px] w-full"
      role="img"
      aria-label={`Income versus spending by month${pill && cur ? `. ${shortMonthLabel(cur.month)} so far: ${pill}` : ""}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 28, right: 8, bottom: 0, left: 8 }} barGap={3} barCategoryGap="30%">
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={(p: TickProps) => (
              <text x={p.x} y={Number(p.y ?? 0) + 8} textAnchor="middle" className={`viz-tick${p.payload?.index === last ? " viz-tick-now" : ""}`}>
                {shortMonthLabel(String(p.payload?.value ?? "")).split(" ")[0]}
              </text>
            )}
          />
          <YAxis hide tickCount={3} domain={[0, "auto"]} />
          <Tooltip content={<ChartTooltip labelFormatter={(l) => shortMonthLabel(String(l))} />} cursor={{ className: "viz-cursor-bar" }} />
          <Bar className="viz-bar-income" dataKey="income" name="Income" fill="var(--series-3)" barSize={13} shape={pillShape("viz-bar-income-rect", last)} isAnimationActive={false} />
          <Bar
            className="viz-bar-spent"
            dataKey="expense"
            name="Spent"
            fill="var(--series-2)"
            barSize={13}
            shape={pillShape("viz-bar-spent-rect", last)}
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
