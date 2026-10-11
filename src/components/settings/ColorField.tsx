"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";

/** A short list to pick from. Any hex still works through "custom", so a category can have exactly the colour its owner wants. */
const SWATCHES = ["#ef4444", "#f97316", "#f59e0b", "#16a34a", "#10b981", "#06b6d4", "#3b82f6", "#0369a1", "#8b5cf6", "#7c3aed", "#ec4899", "#64748b"];

/**
 * A category's colour: a row of swatches plus a custom colour. It submits as the form field `color` (a hidden input), so
 * the form action is the same as it was with a bare colour input. The colour only tints the category's tiles (the label
 * text never uses it), so any choice stays readable.
 */
export function ColorField({ defaultValue = "#64748b" }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue.toLowerCase());
  const custom = !SWATCHES.includes(value);
  return (
    <fieldset className="col-span-2 md:col-span-6">
      <legend className="label">Colour</legend>
      <input type="hidden" name="color" value={value} />
      <div className="flex flex-wrap items-center gap-2">
        {SWATCHES.map((c) => {
          const on = value === c;
          return (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={on}
              onClick={() => setValue(c)}
              style={{ backgroundColor: c }}
              className="grid size-9 place-items-center rounded-full text-white ring-offset-2 ring-offset-card aria-pressed:ring-2 aria-pressed:ring-foreground"
            >
              {on && <Check size={16} strokeWidth={3} aria-hidden />}
            </button>
          );
        })}
        {/* The browser's own colour picker, behind a "+" swatch (or showing the custom colour once one is chosen). */}
        <label
          className={`relative grid size-9 cursor-pointer place-items-center rounded-full border border-dashed border-line text-muted ring-offset-2 ring-offset-card focus-within:outline-2 ${custom ? "ring-2 ring-foreground" : ""}`}
          style={custom ? { backgroundColor: value, borderStyle: "solid" } : undefined}
        >
          {custom ? <Check size={16} strokeWidth={3} className="text-white" aria-hidden /> : <Plus size={16} aria-hidden />}
          <input
            type="color"
            value={value}
            onChange={(e) => setValue(e.target.value.toLowerCase())}
            aria-label="Custom colour"
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </fieldset>
  );
}
