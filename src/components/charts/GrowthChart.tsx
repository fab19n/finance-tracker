"use client";

import type { Key } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dayLabel, shortMonthLabel } from "@/lib/dates";
import { ChartTooltip, compactRM } from "./ChartTooltip";

type Point = { date: string; value: number; contributed: number };
type DotProps = { cx?: number; cy?: number; index?: number; key?: Key | null };

/**
 * Growth vs deposits: what your investments are worth (blue) against the money you put in (gray).
 * The gap between the lines is growth - the whole point of investing.
 */
export function GrowthChart({ data }: { data: Point[] }) {
  const last = data.length - 1;
  const endDot = (p: DotProps) =>
    p.index === last && p.cx !== undefined && p.cy !== undefined ? (
      <circle key={p.key ?? "end"} cx={p.cx} cy={p.cy} r={5} strokeWidth={2} style={{ fill: "var(--series-1)", stroke: "var(--card)" }} />
    ) : (
      <g key={p.key ?? p.index} />
    );
  return (
    <div className="h-64 w-full" role="img" aria-label="Investment value compared with money contributed over time">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => shortMonthLabel(d.slice(0, 7))}
            tickLine={false}
            tick={{ fontSize: 11 }}
            minTickGap={32}
          />
          <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11 }} tickFormatter={compactRM} domain={[0, "auto"]} />
          <Tooltip
            content={<ChartTooltip labelFormatter={(l) => dayLabel(String(l))} />}
            cursor={{ className: "viz-cursor-line", strokeWidth: 1 }}
          />
          <Line
            className="viz-line-contributed"
            type="stepAfter"
            dataKey="contributed"
            name="Money you put in"
            stroke="var(--series-gray)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, style: { fill: "var(--series-gray)", stroke: "var(--card)" } }}
            isAnimationActive={false}
          />
          <Line
            className="viz-line-value"
            type="monotone"
            dataKey="value"
            name="Worth today"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinecap="round"
            dot={endDot}
            activeDot={{ r: 5, strokeWidth: 2, style: { fill: "var(--series-1)", stroke: "var(--card)" } }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
