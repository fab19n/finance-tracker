"use client";

import { ListFilter, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef } from "react";

type Option = { id: number; name: string };

const SORT_LABELS = [
  ["newest", "Newest first"],
  ["oldest", "Oldest first"],
  ["largest", "Largest amount first"],
  ["smallest", "Smallest amount first"],
] as const;

/**
 * The "Filter" button on Activity and the dialog it opens (a bottom sheet on phones, a centred dialog from md up): category,
 * a date range (with quick ranges), an amount range and the order. The account has its own row of chips on the page, where
 * it is one tap. This is a GET form to the same page, so everything lives in the address and the server applies it.
 * `others` are the settings it does NOT edit and must keep (month, type, search, account); a new filter starts at page 1.
 * `applied` is how many of its own filters are on, for the badge.
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
  values: { category: string; from: string; to: string; min: string; max: string; sort: string };
  /** Quick date ranges, as ready-made links (built on the server, where today's date is known). */
  presets: { label: string; href: string }[];
  others: Record<string, string>;
  clearHref: string;
  applied: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="chip">
        <ListFilter size={14} strokeWidth={2.5} aria-hidden />
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
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className="m-auto max-h-[92dvh] w-[min(26rem,calc(100%-2rem))] overflow-y-auto rounded-3xl bg-card p-0 text-foreground backdrop:bg-overlay max-md:mb-0 max-md:w-full max-md:max-w-none max-md:rounded-b-none"
      >
        <form action="/transactions" method="get" className="space-y-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:pb-5">
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="h2">
              Filter entries
            </h2>
            <button type="button" aria-label="Close" onClick={close} className="grid size-9 place-items-center rounded-full text-muted hover:bg-card-subtle">
              <X size={18} />
            </button>
          </div>
          {Object.entries(others).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}

          <div>
            <label htmlFor="filter-category" className="label">
              Category
            </label>
            <select id="filter-category" name="category" defaultValue={values.category} className="input">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="label">Dates</legend>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="filter-from" className="sr-only">
                  From date
                </label>
                <input id="filter-from" name="from" type="date" defaultValue={values.from} className="input min-w-0" />
              </div>
              <div>
                <label htmlFor="filter-to" className="sr-only">
                  To date
                </label>
                <input id="filter-to" name="to" type="date" defaultValue={values.to} className="input min-w-0" />
              </div>
            </div>
            <p className="sub mt-1">Leave both empty to use the month on screen.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <Link key={p.label} href={p.href} onClick={close} className="chip">
                  {p.label}
                </Link>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="label">Amount (RM)</legend>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="filter-min" className="sr-only">
                  At least, in RM
                </label>
                <input id="filter-min" name="min" inputMode="decimal" autoComplete="off" placeholder="At least" defaultValue={values.min} className="input min-w-0" />
              </div>
              <div>
                <label htmlFor="filter-max" className="sr-only">
                  At most, in RM
                </label>
                <input id="filter-max" name="max" inputMode="decimal" autoComplete="off" placeholder="At most" defaultValue={values.max} className="input min-w-0" />
              </div>
            </div>
            <p className="sub mt-1">The same number in both finds an exact amount.</p>
          </fieldset>

          <div>
            <label htmlFor="filter-sort" className="label">
              Order
            </label>
            <select id="filter-sort" name="sort" defaultValue={values.sort || "newest"} className="input">
              {SORT_LABELS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Link href={clearHref} onClick={close} className="btn">
              Clear
            </Link>
            <button type="submit" className="btn-primary">
              Apply
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
