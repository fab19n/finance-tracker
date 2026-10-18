"use client";

import type { Key } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CumulativePoint } from "@/lib/analytics/summary";
import { ChartTooltip, compactRM } from "./ChartTooltip";

type DotProps = { cx?: number; cy?: number; index?: number; key?: Key | null };

/**
 * Cumulative spending through the month vs the previous month. One axis: this month as a solid accent line over a soft
 * accent area, last month as a dotted gray line. The colours live in globals.css (viz-*), which is how they follow the theme.
 */
export function CumulativeSpendChart({
  data,
  currentLabel,
  previousLabel,
}: {
  data: CumulativePoint[];
  currentLabel: string;
  previousLabel: string;
}) {
  const lastIdx = data.reduce((acc, p, i) => (p.current !== null ? i : acc), -1);
  return (
    <div className="h-64 w-full" role="img" aria-label={`Cumulative spending, ${currentLabel} versus ${previousLabel}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fontSize: 11 }}
            tickFormatter={compactRM}
          />
          <Tooltip
            content={<ChartTooltip labelFormatter={(l) => `Day ${l}`} />}
            cursor={{ className: "viz-cursor-line", strokeWidth: 1 }}
          />
          <Area
            className="viz-area-current"
            type="monotone"
            dataKey="current"
            stroke="none"
            fill="none"
            connectNulls={false}
            activeDot={false}
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
          />
          <Line
            className="viz-line-previous"
            type="monotone"
            dataKey="previous"
            name={previousLabel}
            stroke="var(--series-gray)"
            strokeWidth={2}
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, style: { fill: "var(--series-gray)", stroke: "var(--card)" } }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            className="viz-line-current"
            type="monotone"
            dataKey="current"
            name={currentLabel}
            stroke="var(--series-2)"
            strokeWidth={3}
            strokeLinecap="round"
            dot={(p: DotProps) =>
              p.index === lastIdx && p.cx !== undefined && p.cy !== undefined ? (
                <circle key={p.key ?? "end"} cx={p.cx} cy={p.cy} r={6} strokeWidth={3} style={{ fill: "var(--series-2)", stroke: "var(--card)" }} />
              ) : (
                <g key={p.key ?? p.index} />
              )
            }
            activeDot={{ r: 6, strokeWidth: 3, style: { fill: "var(--series-2)", stroke: "var(--card)" } }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
