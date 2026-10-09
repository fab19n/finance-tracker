"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { shortMonthLabel } from "@/lib/dates";
import { ChartTooltip, compactRM } from "./ChartTooltip";

type Point = { month: string; income: number; expense: number };

/** Income vs spending per month: grouped columns, <=24px, 4px rounded tops, 2px gap. */
export function IncomeExpenseChart({ data }: { data: Point[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Income versus spending by month">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 0 }} barGap={2} barCategoryGap="30%">
          <CartesianGrid vertical={false} />
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
          <Bar className="viz-bar-income" dataKey="income" name="Income" fill="var(--series-3)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar className="viz-bar-spent" dataKey="expense" name="Spent" fill="var(--series-1)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
