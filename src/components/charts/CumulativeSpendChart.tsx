"use client";

import type { Key } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CumulativePoint } from "@/lib/analytics/summary";
import { ChartTooltip, compactRM } from "./ChartTooltip";

type DotProps = { cx?: number; cy?: number; index?: number; key?: Key | null };

/**
 * Cumulative spending through the month vs the previous month. One axis, two lines:
 * this month in the spending hue, last month in de-emphasis gray.
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
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
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
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinecap="round"
            dot={(p: DotProps) =>
              p.index === lastIdx && p.cx !== undefined && p.cy !== undefined ? (
                <circle key={p.key ?? "end"} cx={p.cx} cy={p.cy} r={5} strokeWidth={2} style={{ fill: "var(--series-1)", stroke: "var(--card)" }} />
              ) : (
                <g key={p.key ?? p.index} />
              )
            }
            activeDot={{ r: 5, strokeWidth: 2, style: { fill: "var(--series-1)", stroke: "var(--card)" } }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
