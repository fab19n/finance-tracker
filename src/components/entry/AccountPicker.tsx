"use client";

import { Check } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { CardMark } from "@/components/account/CardMark";
import { cardLook, parseMark } from "@/lib/card";
import { formatRMWhole } from "@/lib/money";
import { scrollLeftToShow } from "@/lib/scroll";

export type PickableAccount = {
  id: number;
  name: string;
  type: string;
  /** sen; left out where the page doesn't have balances (the edit page). */
  balance?: number;
  cardColor?: string | null;
  cardNetwork?: string | null;
};

/**
 * Pick an account from mini cards (name and mark on top, balance under it) instead of a dropdown. Three fit across; with
 * more, the row scrolls sideways and keeps the chosen one in view. Underneath it is a real radio group: native radios in a
 * fieldset, so the arrow keys, the form value (`name`) and the screen-reader reading come from the browser. The chosen card
 * has a heavy ring AND a check badge, so it is never colour alone. Each card is 64 px tall, above the 44 px minimum.
 */
export function AccountPicker({
  legend,
  name,
  accounts,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  accounts: PickableAccount[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const group = useId();

  // On a phone the fourth account would be chosen and out of sight: bring it into view (the row's own scroll only).
  useEffect(() => {
    const el = row.current;
    const chosen = el?.querySelector<HTMLElement>("[data-chosen='true']");
    if (!el || !chosen) return;
    const to = scrollLeftToShow({
      scrollLeft: el.scrollLeft,
      viewWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      chipLeft: chosen.offsetLeft,
      chipWidth: chosen.offsetWidth,
    });
    if (to !== null) el.scrollLeft = to;
  }, [value, accounts.length]);

  return (
    <fieldset className="min-w-0">
      <legend className="label">{legend}</legend>
      <div ref={row} className="no-scrollbar relative -mx-1 flex snap-x gap-2 overflow-x-auto px-1 py-1">
        {accounts.map((a) => {
          const look = cardLook({ name: a.name, cardColor: a.cardColor ?? null });
          const plain = look.bg === null;
          const chosen = a.id === value;
          const mark = parseMark(a.cardNetwork);
          const inputId = `${group}-${a.id}`;
          return (
            <label
              key={a.id}
              htmlFor={inputId}
              data-chosen={chosen}
              className="relative block w-[calc((100%-1rem)/3)] min-w-[6.5rem] shrink-0 snap-start cursor-pointer"
            >
              <input
                id={inputId}
                type="radio"
                name={name}
                value={a.id}
                checked={chosen}
                onChange={() => onChange(a.id)}
                className="peer sr-only"
              />
              <span
                className={`flex h-16 flex-col justify-between overflow-hidden rounded-2xl p-2 pr-2.5 transition peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-strong ${
                  plain ? "border border-line bg-card-subtle text-foreground" : ""
                }`}
                style={plain ? undefined : { backgroundColor: look.bg!, color: look.fg! }}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="min-w-0 truncate text-[11px] font-extrabold leading-tight">{a.name}</span>
                  {/* Only the short marks fit a 64 px card beside the name; the wide ones (Touch 'n Go, a typed name) would squeeze it to one letter, and the card's own colour already says which it is. */}
                  {mark && mark.kind === "network" && mark.key !== "tng" && (
                    <span aria-hidden className="shrink-0 [&>*]:!h-4 [&>*]:!text-[11px]">
                      <CardMark mark={mark} />
                    </span>
                  )}
                </span>
                {a.balance !== undefined && (
                  <span className={`num truncate pr-5 text-xs font-extrabold ${a.balance < 0 && plain ? "text-danger" : ""}`}>
                    {a.balance < 0 && <span className="sr-only">Overdrawn: </span>}
                    {formatRMWhole(a.balance)}
                  </span>
                )}
              </span>
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-1.5 right-1.5 hidden size-[18px] place-items-center rounded-full bg-foreground text-background peer-checked:grid"
              >
                <Check size={12} strokeWidth={3} />
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
