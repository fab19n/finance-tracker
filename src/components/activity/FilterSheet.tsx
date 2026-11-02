"use client";

import { ListFilter, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef } from "react";

type Option = { id: number; name: string };

/**
 * The "Filter" button on Activity and the dialog it opens: Category (a bottom sheet on phones, a centred dialog from md up).
 * The account has its own row of chips on the page, where it is one tap. This is a GET form to the same page, so the
 * filters live in the address and the server applies them. `others` are the other settings to keep (month, type, search,
 * account, a date range); a new filter starts again at page 1.
 */
export function FilterSheet({
  categories,
  category,
  others,
  clearHref,
}: {
  categories: Option[];
  category: string;
  others: Record<string, string>;
  clearHref: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const applied = category ? 1 : 0;
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="chip">
        <ListFilter size={14} strokeWidth={2.5} aria-hidden />
        Category
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
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-3xl bg-card p-0 text-foreground backdrop:bg-overlay max-md:mb-0 max-md:w-full max-md:max-w-none max-md:rounded-b-none"
      >
        <form action="/transactions" method="get" className="space-y-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:pb-5">
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="h2">
              Filter by category
            </h2>
            <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="grid size-9 place-items-center rounded-full text-muted hover:bg-card-subtle">
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
            <select id="filter-category" name="category" defaultValue={category} className="input">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Link href={clearHref} onClick={() => ref.current?.close()} className="btn">
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
