"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DuoIcon } from "@/components/DuoIcon";
import { activeDateChoice, TYPE_CHOICES, type DatePreset } from "./filter-logic";

type Option = { id: number; name: string };

const SORT_LABELS = [
  ["newest", "Newest"],
  ["oldest", "Oldest"],
  ["largest", "Largest"],
  ["smallest", "Smallest"],
] as const;

/** A chosen chip or segment is solid gold, heavier AND carries a check, so it is never colour alone. */
const ON = "has-checked:border-accent-strong has-checked:bg-accent has-checked:font-extrabold has-checked:text-accent-fg has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--focus-ring)]";

/** One option of a radio group: a real radio (arrow keys, form value, spoken state from the browser) drawn as a chip or segment. */
function Choice({ name, value, defaultChecked, children, seg = false }: { name: string; value: string; defaultChecked: boolean; children: ReactNode; seg?: boolean }) {
  return (
    <label className={`group cursor-pointer ${seg ? "seg-item" : "chip"} ${ON}`}>
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} className="sr-only" />
      <DuoIcon name="tick" size={13} strokeWidth={3} aria-hidden className="hidden group-has-checked:block" />
      {children}
    </label>
  );
}

/**
 * The "Filter" button on Activity (a 44 px pill in the search row) and the sheet it opens: a bottom sheet on phones (28 px
 * top corners, a grab handle) and a centred dialog from md up. Type, category, dates (quick ranges or typed dates), an
 * amount range and the order. The account has its own row of chips on the page, where it is one tap. This is a GET form to
 * the same page, so everything lives in the address and the server applies it. `others` are the settings it does NOT edit
 * and must keep (month, search, account); a new filter starts at page 1. `applied` is how many of its own filters are on,
 * for the badge. Closing without applying throws the changes away (the form is rebuilt from the address).
 */
export function FilterSheet({
  categories,
  values,
  presets,
  others,
  clearHref,
  applied,
}: {
  categories: Option[];
  values: { type: string; category: string; from: string; to: string; min: string; max: string; sort: string };
  /** Quick date ranges (built on the server, where today's date is known). */
  presets: DatePreset[];
  others: Record<string, string>;
  clearHref: string;
  applied: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [fresh, setFresh] = useState(0);
  const close = () => ref.current?.close();
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex min-h-11 w-[100px] items-center justify-center gap-1.5 rounded-full border border-line bg-card text-[13px] font-bold transition hover:bg-card-subtle active:scale-[0.98]"
      >
        <DuoIcon name="sliders" size={16} strokeWidth={2.2} aria-hidden />
        Filter
        {applied > 0 && (
          <span className="grid min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-extrabold text-accent-fg" aria-label={`${applied} applied`}>
            {applied}
          </span>
        )}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => setFresh((n) => n + 1)}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className="m-auto max-h-[92dvh] w-[min(26rem,calc(100%-2rem))] overflow-y-auto rounded-[28px] border border-line bg-card p-0 text-foreground backdrop:bg-overlay max-md:mb-0 max-md:w-full max-md:max-w-none max-md:rounded-b-none"
      >
        <FilterForm key={fresh} titleId={titleId} close={close} categories={categories} values={values} presets={presets} others={others} clearHref={clearHref} />
      </dialog>
    </>
  );
}

function FilterForm({
  titleId,
  close,
  categories,
  values,
  presets,
  others,
  clearHref,
}: {
  titleId: string;
  close: () => void;
  categories: Option[];
  values: { type: string; category: string; from: string; to: string; min: string; max: string; sort: string };
  presets: DatePreset[];
  others: Record<string, string>;
  clearHref: string;
}) {
  const [from, setFrom] = useState(values.from);
  const [to, setTo] = useState(values.to);
  const [custom, setCustom] = useState(false);
  const dates = activeDateChoice(from, to, presets, custom);
  const typing = dates === "custom";
  const formRef = useRef<HTMLFormElement>(null);
  // "Show N entries": how many entries the form as it stands would list. Asked of /transactions/count (the page's own
  // filters, read-only) after the first change, so opening the sheet costs nothing. `null` = not asked yet, or unavailable.
  const [touched, setTouched] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [formChange, setFormChange] = useState(0);
  useEffect(() => {
    if (!touched || !formRef.current) return;
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(formRef.current)) if (typeof v === "string" && v !== "") params.set(k, v);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/transactions/count?${params}`, { signal: ctl.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { count?: number } | null) => setCount(typeof j?.count === "number" ? j.count : null))
        // A request cancelled by the next keystroke is not a failure; a real one must not leave an old number on the button.
        .catch((e: unknown) => {
          if ((e as { name?: string } | null)?.name !== "AbortError") setCount(null);
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [touched, from, to, custom, formChange]);
  const pick = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
    setCustom(false);
    setTouched(true);
  };
  return (
    <form
      ref={formRef}
      action="/transactions"
      method="get"
      onChange={() => {
        setTouched(true);
        setFormChange((n) => n + 1);
      }}
      className="space-y-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2.5 md:px-5 md:pb-5">
      <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-line md:hidden" />
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="font-display text-xl font-semibold tracking-[-0.01em]">
          Filter
        </h2>
        <button type="button" aria-label="Close" onClick={close} className="ib">
          <DuoIcon name="close" size={18} aria-hidden />
        </button>
      </div>
      {Object.entries(others).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <fieldset>
        <legend className="label">Type</legend>
        <div className="seg">
          {TYPE_CHOICES.map(([v, label]) => (
            <Choice key={label} name="type" value={v} defaultChecked={values.type === v} seg>
              {label}
            </Choice>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Category</legend>
        <div className="flex flex-wrap gap-1.5">
          <Choice name="category" value="" defaultChecked={values.category === ""}>
            All
          </Choice>
          {categories.map((c) => (
            <Choice key={c.id} name="category" value={String(c.id)} defaultChecked={values.category === String(c.id)}>
              {c.name}
            </Choice>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Dates</legend>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={dates === "month"} onClick={() => pick("", "")} className="chip">
            Month on screen
          </button>
          {presets.map((p) => (
            <button key={p.label} type="button" aria-pressed={dates === p.label} onClick={() => pick(p.from, p.to)} className="chip">
              {p.label}
            </button>
          ))}
          <button type="button" aria-pressed={typing} onClick={() => {
              setCustom(true);
              setTouched(true);
            }}
            className="chip">
            Custom
          </button>
        </div>
        {typing ? (
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="filter-from" className="sr-only">
                From date
              </label>
              <input id="filter-from" name="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input min-w-0" />
            </div>
            <div>
              <label htmlFor="filter-to" className="sr-only">
                To date
              </label>
              <input id="filter-to" name="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input min-w-0" />
            </div>
          </div>
        ) : (
          <>
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
          </>
        )}
      </fieldset>

      <fieldset>
        <legend className="sr-only">Amount in RM</legend>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="filter-min" className="label">
              Min amount
            </label>
            <input id="filter-min" name="min" inputMode="decimal" autoComplete="off" placeholder="RM 0" defaultValue={values.min} className="input min-w-0" />
          </div>
          <div>
            <label htmlFor="filter-max" className="label">
              Max amount
            </label>
            <input id="filter-max" name="max" inputMode="decimal" autoComplete="off" placeholder="No limit" defaultValue={values.max} className="input min-w-0" />
          </div>
        </div>
        <p className="sub mt-1">The same number in both finds an exact amount.</p>
      </fieldset>

      <fieldset>
        <legend className="label">Sort</legend>
        <div className="seg">
          {SORT_LABELS.map(([v, label]) => (
            <Choice key={v} name="sort" value={v} defaultChecked={(values.sort || "newest") === v} seg>
              {label}
            </Choice>
          ))}
        </div>
      </fieldset>

      <div className="sticky bottom-0 grid grid-cols-[1fr_2fr] gap-2 bg-card pt-1">
        <Link href={clearHref} onClick={close} className="btn w-full">
          Clear
        </Link>
        <button type="submit" className="btn-primary w-full">
          {count === null ? "Show entries" : `Show ${count.toLocaleString("en-MY")} ${count === 1 ? "entry" : "entries"}`}
        </button>
      </div>
    </form>
  );
}
