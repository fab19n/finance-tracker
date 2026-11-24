"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dayLabel, shortMonthLabel } from "@/lib/dates";
import { formatRMWhole } from "@/lib/money";
import { ChartTooltip } from "./ChartTooltip";
import { ACTIVE_DOT, AreaGradient, endDotRenderer, useGradientId } from "./parts";

/** "Oct ’26": the month and the year with an apostrophe, so it is never read as "October 26th". */
function axisMonth(iso: string): string {
  const [mon, yy] = shortMonthLabel(iso.slice(0, 7)).split(" ");
  return `${mon} ’${yy}`;
}

type Point = { date: string; value: number; contributed: number };

/**
 * Growth vs deposits: what your investments are worth (a gold line over a fading gold area, a pill with today's value on
 * the latest point) against the money you put in (a dotted grey line). The gap between the lines is growth - the whole
 * point of investing. Same axis-free look as the other charts; the figures are in the tooltip and the table twin.
 * There is no S&P 500 comparison series: the app holds no index history, only the expected rate used in the projection.
 */
export function GrowthChart({ data }: { data: Point[] }) {
  const gid = useGradientId();
  const last = data.length - 1;
  return (
    <div className="h-[170px] w-full" role="img" aria-label="Investment value compared with money contributed over time">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart accessibilityLayer={false} data={data} margin={{ top: 28, right: 10, bottom: 4, left: 10 }}>
          <AreaGradient id={gid} />
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d: string) => axisMonth(d)} tickLine={false} axisLine={false} minTickGap={40} interval="preserveStartEnd" />
          <YAxis hide tickCount={3} domain={[0, "auto"]} />
          <Tooltip content={<ChartTooltip labelFormatter={(l) => dayLabel(String(l))} />} cursor={{ className: "viz-cursor-line", strokeWidth: 1 }} />
          <Area type="monotone" dataKey="value" stroke="none" fill={`url(#${gid})`} activeDot={false} legendType="none" tooltipType="none" isAnimationActive={false} />
          <Line
            className="viz-line-contributed"
            type="stepAfter"
            dataKey="contributed"
            name="Money you put in"
            stroke="var(--series-gray)"
            strokeWidth={1.8}
            strokeLinecap="round"
            dot={false}
            activeDot={{ ...ACTIVE_DOT, className: "viz-dot viz-dot-gray" }}
            isAnimationActive={false}
          />
          <Line
            className="viz-line-value"
            type="monotone"
            dataKey="value"
            name="Worth today"
            stroke="var(--series-2)"
            strokeWidth={2.4}
            strokeLinecap="round"
            dot={endDotRenderer(last, (pt: { value: number }) => formatRMWhole(pt.value))}
            activeDot={ACTIVE_DOT}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
