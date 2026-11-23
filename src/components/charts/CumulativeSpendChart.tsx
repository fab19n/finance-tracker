"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CumulativePoint } from "@/lib/analytics/summary";
import { formatRMWhole } from "@/lib/money";
import { ChartTooltip } from "./ChartTooltip";
import { ACTIVE_DOT, AreaGradient, endDotRenderer, useGradientId } from "./parts";

/**
 * Cumulative spending through the period vs the previous one, drawn the way the design draws it: compact, no axes, three
 * dashed gridlines, this period as a gold line over a gold area that fades out, the last one as a dotted grey line, and a
 * dark pill with the total pinned to the latest day. Hover or focus still gives the day-by-day tooltip, and the page keeps
 * a "View as table" next to it.
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
  const gid = useGradientId();
  const lastIdx = data.reduce((acc, p, i) => (p.current !== null ? i : acc), -1);
  const total = lastIdx >= 0 ? data[lastIdx].current : null;
  return (
    <div
      className="h-[140px] w-full"
      role="img"
      aria-label={`Cumulative spending, ${currentLabel} versus ${previousLabel}${total !== null ? `. ${currentLabel} so far: ${formatRMWhole(total)}` : ""}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 28, right: 10, bottom: 4, left: 10 }}>
          <AreaGradient id={gid} />
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" hide />
          <YAxis hide tickCount={3} domain={[0, "auto"]} />
          <Tooltip content={<ChartTooltip labelFormatter={(l) => `Day ${l}`} />} cursor={{ className: "viz-cursor-line", strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="current"
            stroke="none"
            fill={`url(#${gid})`}
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
            strokeWidth={1.8}
            strokeLinecap="round"
            dot={false}
            activeDot={{ ...ACTIVE_DOT, className: "viz-dot viz-dot-gray" }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            className="viz-line-current"
            type="monotone"
            dataKey="current"
            name={currentLabel}
            stroke="var(--series-2)"
            strokeWidth={2.4}
            strokeLinecap="round"
            dot={endDotRenderer(lastIdx, (pt: { current: number | null }) => (pt.current === null ? null : formatRMWhole(pt.current)))}
            activeDot={ACTIVE_DOT}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
