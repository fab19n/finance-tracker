"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { shortMonthLabel } from "@/lib/dates";
import { ChartTooltip, compactRM } from "./ChartTooltip";

type Point = { month: string; income: number; expense: number };

/** Income vs spending per month: grouped pill-shaped columns (fully rounded, <=14px wide), a faint dashed grid. */
export function IncomeExpenseChart({ data }: { data: Point[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Income versus spending by month">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 0 }} barGap={4} barCategoryGap="35%">
          <CartesianGrid vertical={false} strokeDasharray="3 5" />
          <XAxis
            dataKey="month"
            tickFormatter={shortMonthLabel}
            tickLine={false}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fontSize: 11 }}
            tickFormatter={compactRM}
          />
          <Tooltip
            content={<ChartTooltip labelFormatter={(l) => shortMonthLabel(String(l))} />}
            cursor={{ className: "viz-cursor-bar" }}
          />
          <Bar className="viz-bar-income" dataKey="income" name="Income" fill="var(--series-3)" maxBarSize={14} radius={7} isAnimationActive={false} />
          <Bar className="viz-bar-spent" dataKey="expense" name="Spent" fill="var(--series-2)" maxBarSize={14} radius={7} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
