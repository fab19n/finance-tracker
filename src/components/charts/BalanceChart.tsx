"use client";

import type { Key } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dayLabel, shortDate } from "@/lib/dates";
import { ChartTooltip, compactRM } from "./ChartTooltip";

type Point = { date: string; balance: number };
type DotProps = { cx?: number; cy?: number; index?: number; key?: Key | null };

/**
 * One account's balance through a period: a stepped accent line over a soft accent area (a balance holds its value until
 * something changes it, so the line steps rather than slopes). The colours are the "value" classes in globals.css.
 */
export function BalanceChart({ data, name }: { data: Point[]; name: string }) {
  const last = data.length - 1;
  return (
    <div className="h-56 w-full" role="img" aria-label={`${name} balance through the period`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={40} />
          <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11 }} tickFormatter={compactRM} domain={["auto", "auto"]} />
          <Tooltip content={<ChartTooltip labelFormatter={(l) => dayLabel(String(l))} />} cursor={{ className: "viz-cursor-line", strokeWidth: 1 }} />
          <Area
            className="viz-area-value"
            type="stepAfter"
            dataKey="balance"
            stroke="none"
            fill="none"
            activeDot={false}
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
          />
          <Line
            className="viz-line-value"
            type="stepAfter"
            dataKey="balance"
            name="Balance"
            stroke="var(--series-2)"
            strokeWidth={3}
            strokeLinecap="round"
            dot={(p: DotProps) =>
              p.index === last && p.cx !== undefined && p.cy !== undefined ? (
                <circle key={p.key ?? "end"} cx={p.cx} cy={p.cy} r={6} strokeWidth={3} style={{ fill: "var(--series-2)", stroke: "var(--card)" }} />
              ) : (
                <g key={p.key ?? p.index} />
              )
            }
            activeDot={{ r: 6, strokeWidth: 3, style: { fill: "var(--series-2)", stroke: "var(--card)" } }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
