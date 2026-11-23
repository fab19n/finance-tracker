"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dayLabel } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { ChartTooltip } from "./ChartTooltip";
import { ACTIVE_DOT, AreaGradient, endDotRenderer, useGradientId } from "./parts";

type Point = { date: string; balance: number };

/**
 * One account's balance through a period, as the design's short strip: a smooth 2.4px gold line over a fading gold area,
 * one dashed gridline, no axes, a haloed dot on the latest day. The exact figures are in the card above it, the hover
 * tooltip and the "View as table" beside it.
 */
export function BalanceChart({ data, name }: { data: Point[]; name: string }) {
  const gid = useGradientId();
  const last = data.length - 1;
  const end = last >= 0 ? data[last].balance : null;
  return (
    <div className="h-[84px] w-full" role="img" aria-label={`${name} balance through the period${end !== null ? `, now ${formatRM(end)}` : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 4, left: 10 }}>
          <AreaGradient id={gid} />
          <CartesianGrid vertical={false} horizontalCoordinatesGenerator={({ height, offset }) => [(offset?.top ?? 0) + height / 2]} />
          <XAxis dataKey="date" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip content={<ChartTooltip labelFormatter={(l) => dayLabel(String(l))} />} cursor={{ className: "viz-cursor-line", strokeWidth: 1 }} />
          <Area type="monotone" dataKey="balance" stroke="none" fill={`url(#${gid})`} activeDot={false} legendType="none" tooltipType="none" isAnimationActive={false} />
          <Line
            className="viz-line-value"
            type="monotone"
            dataKey="balance"
            name="Balance"
            stroke="var(--series-2)"
            strokeWidth={2.4}
            strokeLinecap="round"
            dot={endDotRenderer(last)}
            activeDot={ACTIVE_DOT}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
