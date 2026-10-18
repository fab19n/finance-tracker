"use client";

import { formatRM } from "@/lib/money";

type Entry = { name?: string | number; value?: number | string; color?: string; dataKey?: string | number };

/**
 * Shared Recharts tooltip: a dark pill with a swatch + series name + RM value per row (the design's "today" bubble).
 * Colours come from the mark (a swatch), never from tinting the text.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean;
  payload?: Entry[];
  label?: string | number;
  labelFormatter?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl bg-foreground px-3.5 py-2.5 text-xs font-bold text-background">
      {label !== undefined && <p className="mb-1 font-extrabold">{labelFormatter ? labelFormatter(label) : String(label)}</p>}
      <ul className="space-y-0.5">
        {rows.map((p) => (
          <li key={String(p.dataKey ?? p.name)} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-background/80">{p.name}</span>
            <span className="num ml-auto pl-3 font-black">{formatRM(Number(p.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Compact RM axis tick from sen: 120000 -> "1.2k". */
export function compactRM(sen: number): string {
  const rm = sen / 100;
  if (Math.abs(rm) >= 1_000_000) return `${+(rm / 1_000_000).toFixed(1)}M`;
  if (Math.abs(rm) >= 1000) return `${+(rm / 1000).toFixed(1)}k`;
  return String(Math.round(rm));
}
