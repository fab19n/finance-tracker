"use client";

import { Check, LayoutGrid } from "lucide-react";
import { useState } from "react";
import { DuoIcon } from "@/components/DuoIcon";
import { initials } from "@/lib/initials";
import { categoryIconName, visibleCategories } from "./entry-logic";

export type PickableCategory = { id: number; name: string; color: string };

/**
 * Categories as round 44 px discs with the name beneath, three across. The disc carries a dual-tone icon when the name
 * clearly means one we have, otherwise the category's initials; it is tinted with the category's own colour (user data;
 * the name stays the text colour). Chosen = a gold disc with a ring and a check badge, never colour alone. The sixth tile
 * is "Show all" (then "Show fewer").
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: PickableCategory[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { shown, foldable } = visibleCategories(categories, value, expanded);
  return (
    <div role="group" aria-labelledby="category-label">
      <span id="category-label" className="label">
        Category
      </span>
      <div className="grid grid-cols-3 gap-x-1 gap-y-1">
        {shown.map((c) => {
          const selected = value === c.id;
          const icon = categoryIconName(c.name);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              aria-pressed={selected}
              className="flex min-h-[74px] flex-col items-center gap-1.5 rounded-2xl px-1 py-1.5 text-center text-[11.5px] font-bold leading-tight transition active:scale-95"
            >
              <span
                className={`relative grid size-11 place-items-center rounded-full transition ${
                  selected ? "bg-accent text-accent-fg ring-2 ring-foreground ring-offset-2 ring-offset-background" : "text-foreground"
                }`}
                style={selected ? undefined : { backgroundColor: `${c.color}26` }}
                aria-hidden
              >
                {icon ? <DuoIcon name={icon} size={22} aria-hidden /> : <span className="text-xs font-extrabold">{initials(c.name)}</span>}
                {selected && (
                  <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full border-[1.5px] border-foreground bg-background text-foreground">
                    <Check size={10} strokeWidth={3.5} />
                  </span>
                )}
              </span>
              <span className="line-clamp-2 break-words">{c.name}</span>
            </button>
          );
        })}
        {foldable && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex min-h-[74px] flex-col items-center gap-1.5 rounded-2xl px-1 py-1.5 text-center text-[11.5px] font-bold leading-tight text-accent-strong transition active:scale-95"
          >
            <span className="grid size-11 place-items-center rounded-full border-[1.5px] border-dashed border-accent-strong" aria-hidden>
              <LayoutGrid size={20} />
            </span>
            {expanded ? "Show fewer" : `Show all ${categories.length}`}
          </button>
        )}
      </div>
    </div>
  );
}
