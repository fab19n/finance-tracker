"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { bulkDelete, bulkSetCategory, type BulkResult } from "@/app/actions/transactions";
import { ActionForm, useActionPending } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { bulkDeleteSheet, summarize, type Selection } from "@/lib/entry-bulk";
import { BULK_FORM_ID, categoryHint, categoryKind, uniqueTicked, type TickedBox } from "./bulk-logic";

const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${BULK_FORM_ID}"]`));

function readTicked(): TickedBox[] {
  return uniqueTicked(
    boxes()
      .filter((b) => b.checked)
      .map((b) => ({ id: b.value, type: b.dataset.type ?? "expense", amount: Number(b.dataset.amount) || 0, linked: b.dataset.linked === "1" })),
  );
}

const toSelection = (t: TickedBox[]): Selection => summarize(t.map((x) => ({ type: x.type as "income" | "expense" | "transfer", amount: x.amount, linked: x.linked })));

/**
 * Select mode's sticky action bar: "N selected", Set category, Delete, Select all on this page, Done. It IS the form the row
 * checkboxes belong to (they point at it with `form=`), and reads them from the page, so the rows stay server-rendered.
 * Each entry has a box in the phone list and in the desktop table (one of them hidden): ticking one ticks its twin, and the
 * count and the ids sent count each entry once.
 */
export function BulkBar({ categories, doneHref }: { categories: { id: number; name: string; type: "income" | "expense" }[]; doneHref: string }) {
  const [selection, setSelection] = useState<Selection>(() => toSelection([]));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [categoryId, setCategoryId] = useState("");

  const recount = useCallback(() => setSelection(toSelection(readTicked())), []);

  useEffect(() => {
    function onChange(e: Event) {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.getAttribute("form") !== BULK_FORM_ID) return;
      // Keep the hidden twin (phone list <-> desktop table) in step with the one that was tapped.
      for (const twin of boxes()) if (twin !== t && twin.value === t.value) twin.checked = t.checked;
      setResult(null);
      recount();
    }
    // A successful send resets the form (every box unticks): count again once that has happened.
    function onReset() {
      setTimeout(recount, 0);
    }
    document.addEventListener("change", onChange);
    const form = document.getElementById(BULK_FORM_ID);
    form?.addEventListener("reset", onReset);
    // Boxes the browser restored as ticked (back/forward) count too.
    const first = setTimeout(recount, 0);
    return () => {
      clearTimeout(first);
      document.removeEventListener("change", onChange);
      form?.removeEventListener("reset", onReset);
    };
  }, [recount]);

  function selectAll() {
    const all = boxes();
    const everyOn = all.length > 0 && all.every((b) => b.checked);
    for (const b of all) b.checked = !everyOn;
    setResult(null);
    recount();
  }

  const kind = categoryKind(selection);
  const hint = categoryHint(selection);
  const choices = kind ? categories.filter((c) => c.type === kind) : [];
  const chosen = choices.some((c) => String(c.id) === categoryId) ? categoryId : "";
  const sheet = bulkDeleteSheet(selection);

  async function run(data: FormData) {
    const ids = data.getAll("id").map(Number);
    let r: BulkResult;
    if (data.get("intent") === "category") {
      r = await bulkSetCategory(ids, Number(data.get("categoryId")), data.get("confirmLinked") === "1");
    } else {
      // The delete sheet named any entries tied to a bill, person or import, so confirming it is the explicit yes.
      r = await bulkDelete(ids, selection.linked > 0);
    }
    if (r.ok) setCategoryId("");
    setResult({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" });
  }

  return (
    <ActionForm
      id={BULK_FORM_ID}
      action={run}
      className="sticky bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-20 space-y-2 rounded-2xl border border-line bg-card p-3 text-foreground md:bottom-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-[14px] font-extrabold">
          {selection.count} selected
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn min-h-11" onClick={selectAll}>
            Select all on this page
          </button>
          <Link href={doneHref} className="btn-primary min-h-11">
            Done
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="bulk-category">
          Category to set
        </label>
        <select
          id="bulk-category"
          name="categoryId"
          className="input min-h-11 w-auto min-w-0 flex-1 md:max-w-60"
          value={chosen}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={!kind}
        >
          <option value="">{kind ? "Choose a category" : "Category"}</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <SetCategoryButton disabled={!kind || chosen === ""} />
        <ConfirmSubmit
          trigger="Delete"
          triggerClassName="btn-danger min-h-11"
          triggerLabel={`Delete ${selection.count} selected`}
          disabled={selection.count === 0}
          title={sheet.title}
          body={sheet.body}
          warnings={sheet.warnings}
          confirmLabel={`Delete ${selection.count}`}
        />
      </div>

      {selection.linked > 0 && kind && (
        <label className="flex min-h-11 items-center gap-2 text-[13px] font-bold">
          <input type="checkbox" name="confirmLinked" value="1" className="size-5 accent-accent-strong" />
          Also change the {selection.linked} {selection.linked === 1 ? "entry" : "entries"} tied to a bill, a person or a bank import
        </label>
      )}
      {hint && <p className="sub">{hint}</p>}
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`banner ${result.ok ? "banner-info" : "banner-danger"}`}>
          {result.text}
        </p>
      )}
    </ActionForm>
  );
}

/** The "Set category" submit: it names its intent so the form's one action knows which of the two buttons was pressed. */
function SetCategoryButton({ disabled }: { disabled: boolean }) {
  const pending = useActionPending();
  return (
    <button type="submit" name="intent" value="category" className="btn min-h-11" disabled={disabled || pending}>
      Set category
    </button>
  );
}
