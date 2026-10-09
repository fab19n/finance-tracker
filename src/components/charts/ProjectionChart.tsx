"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProjectionPoint } from "@/lib/investing/advisor";
import { ChartTooltip, compactRM } from "./ChartTooltip";

/** Same cash, three ways: all FD, all S&P 500, or your mix - at the *expected* rates. One axis. */
export function ProjectionChart({ data }: { data: ProjectionPoint[] }) {
  const common = { strokeWidth: 2, dot: false, isAnimationActive: false, strokeLinecap: "round" as const };
  return (
    <div className="h-64 w-full" role="img" aria-label="Projected growth: fixed deposit, S&P 500, and your mix">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="year" tickLine={false} tick={{ fontSize: 11 }} tickFormatter={(y: number) => (y === 0 ? "now" : `${y}y`)} />
          <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11 }} tickFormatter={compactRM} domain={[0, "auto"]} />
          <Tooltip
            content={<ChartTooltip labelFormatter={(l) => (Number(l) === 0 ? "Today" : `After ${l} years`)} />}
            cursor={{ className: "viz-cursor-line", strokeWidth: 1 }}
          />
          <Line {...common} className="viz-line-contributed" dataKey="contributed" name="Money you put in" stroke="var(--series-gray)" activeDot={{ r: 4, strokeWidth: 2, style: { fill: "var(--series-gray)", stroke: "var(--card)" } }} />
          <Line {...common} className="viz-line-fd" dataKey="fd" name="All fixed deposit" stroke="var(--series-1)" activeDot={{ r: 4, strokeWidth: 2, style: { fill: "var(--series-1)", stroke: "var(--card)" } }} />
          <Line {...common} className="viz-line-sp" dataKey="sp" name="All S&P 500" stroke="var(--series-3)" activeDot={{ r: 4, strokeWidth: 2, style: { fill: "var(--series-3)", stroke: "var(--card)" } }} />
          <Line {...common} className="viz-line-mix" dataKey="mix" name="Your mix" stroke="var(--series-2)" activeDot={{ r: 4, strokeWidth: 2, style: { fill: "var(--series-2)", stroke: "var(--card)" } }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
