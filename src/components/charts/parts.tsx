"use client";

import { useId, type Key } from "react";

/**
 * Pieces every compact chart shares. Colours are CSS classes (viz-* in globals.css): var() does not resolve in SVG
 * presentation attributes, but it does in a class, which is also how the charts follow light/dark.
 */

/** An id for an SVG gradient that is safe inside url(#...) (React's useId has colons). */
export function useGradientId(): string {
  return `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

/** The gold area's vertical fade, 42% at the line to 0 at the bottom. Put it inside the chart as <defs>. */
export function AreaGradient({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" className="viz-grad-top" />
        <stop offset="100%" className="viz-grad-bottom" />
      </linearGradient>
    </defs>
  );
}

/** A single dark pill carrying one short value ("RM 3,120"). `anchor` "end" right-aligns it on x. */
export function ValuePill({ x, y, text, anchor = "end" }: { x: number; y: number; text: string; anchor?: "end" | "middle" }) {
  const w = Math.round(text.length * 6.6 + 16);
  const left = anchor === "end" ? x - w : x - w / 2;
  return (
    <g pointerEvents="none">
      <rect x={left} y={y} width={w} height={22} rx={11} className="viz-pill" />
      <text x={left + w / 2} y={y + 15} textAnchor="middle" className="viz-pill-text">
        {text}
      </text>
    </g>
  );
}

type DotProps = { cx?: number; cy?: number; index?: number; key?: Key | null; payload?: unknown };

/**
 * The Line `dot` renderer: nothing except on the LAST point, where it draws the haloed dot (r 4.5, 2 px card-coloured
 * edge, a 22% halo) and, if `pill` returns text, a dark pill with the value just above it.
 */
export function endDotRenderer(last: number, pill?: (payload: never) => string | null) {
  const EndDot = (p: DotProps) => {
    if (p.index !== last || p.cx === undefined || p.cy === undefined) return <g key={p.key ?? p.index} />;
    const text = pill ? pill(p.payload as never) : null;
    const above = p.cy >= 34;
    return (
      <g key={p.key ?? "end"}>
        <circle cx={p.cx} cy={p.cy} r={10} className="viz-halo" />
        <circle cx={p.cx} cy={p.cy} r={4.5} className="viz-dot" />
        {text && <ValuePill x={p.cx + 6} y={above ? p.cy - 32 : p.cy + 12} text={text} />}
      </g>
    );
  };
  return EndDot;
}

/** The hover/focus dot: the same dot without the halo. */
export const ACTIVE_DOT = { r: 4.5, strokeWidth: 2, className: "viz-dot" } as const;
