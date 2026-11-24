"use client";

import { Check } from "lucide-react";

/**
 * An on/off row: the label and its explanation on the left, a 48 x 28 switch on the right. The whole row is one button
 * (role="switch"), at least 52 px tall, so the target is large. On is the gold fill with a check in the knob, off the quiet
 * track, so the state is never colour alone.
 */
export function Switch({ label, hint, on, onChange, divider = false }: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void; divider?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`flex min-h-[52px] w-full items-center justify-between gap-3 py-2.5 text-left ${divider ? "border-t border-line" : ""}`}
    >
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold">{label}</span>
        <span className="sub block">{hint}</span>
      </span>
      <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full border transition ${on ? "border-accent-strong bg-accent" : "border-line bg-card-subtle"}`}>
        <span className={`absolute top-[3px] grid size-5 place-items-center rounded-full transition-all motion-reduce:transition-none ${on ? "left-[23px] bg-accent-fg text-accent" : "left-[3px] bg-muted"}`}>
          {on && <Check size={12} strokeWidth={3.4} />}
        </span>
      </span>
    </button>
  );
}
