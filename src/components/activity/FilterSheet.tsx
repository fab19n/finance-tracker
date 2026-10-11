"use client";

import { ListFilter, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef } from "react";

type Option = { id: number; name: string; icon?: string };

/**
 * The "Filter" button on Activity and the dialog it opens: Category and Account (a bottom sheet on phones, a centred
 * dialog from md up). It is a GET form to the same page, so the filters live in the address and the server applies them.
 * `others` are the other settings to keep (month, type, search); a new filter starts again at page 1.
 */
export function FilterSheet({
  categories,
  accounts,
  category,
  account,
  others,
  clearHref,
}: {
  categories: Option[];
  accounts: Option[];
  category: string;
  account: string;
  others: Record<string, string>;
  clearHref: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const applied = (category ? 1 : 0) + (account ? 1 : 0);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
          applied ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-foreground hover:bg-background"
        }`}
      >
        <ListFilter size={16} aria-hidden />
        Filter
        {applied > 0 && (
          <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-fg" aria-label={`${applied} applied`}>
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
        className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-2xl border border-line bg-card p-0 text-foreground shadow-card backdrop:bg-overlay max-md:mb-0 max-md:w-full max-md:max-w-none max-md:rounded-b-none"
      >
        <form action="/transactions" method="get" className="space-y-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:pb-5">
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-base font-bold">
              Filter entries
            </h2>
            <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-background">
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
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-account" className="label">
              Account
            </label>
            <select id="filter-account" name="account" defaultValue={account} className="input">
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Link href={clearHref} onClick={() => ref.current?.close()} className="btn">
              Clear
            </Link>
            <button type="submit" className="btn-primary !py-3 !text-sm">
              Apply
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
