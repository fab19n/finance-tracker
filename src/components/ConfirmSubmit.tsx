"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useActionPending } from "./ActionForm";
import { DuoIcon } from "./DuoIcon";

/**
 * A button that asks "are you sure?" before the surrounding <form> is submitted. It is a native <dialog>, opened with
 * showModal(): a bottom sheet on phones and a centred dialog from md up, with Esc, a click on the dim backdrop and Cancel
 * all closing it, and focus trapped and restored by the browser.
 *
 * The dialog sits INSIDE the form, so its confirm button (type="submit") submits that form (a Server Action form works
 * unchanged). Put the whole thing where the old delete/archive button was.
 */
export function ConfirmSubmit({
  trigger,
  triggerClassName,
  triggerLabel,
  title,
  body,
  warnings,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  tone = "danger",
  disabled,
}: {
  /** What the opening button shows (an icon, or text). */
  trigger: ReactNode;
  triggerClassName?: string;
  /** Accessible name for the opening button; needed when `trigger` is only an icon. */
  triggerLabel?: string;
  title: string;
  body?: ReactNode;
  /** Sentences that matter before saying yes (what else the action undoes), listed under the body. */
  warnings?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for things that can't be undone; "neutral" for ones that can (archive, lock). */
  tone?: "danger" | "neutral";
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // The dialog is only put on the page when it is first asked for: a list of 100 entries has 100 of these buttons, and
  // 100 hidden copies of the same sheet would be dead weight.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (mounted && ref.current && !ref.current.open) ref.current.showModal();
  }, [mounted]);
  const titleId = useId();
  // Inside an ActionForm both buttons dim while the action runs, so a confirmed delete can't be sent twice.
  const pending = useActionPending();
  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        title={triggerLabel}
        disabled={disabled || pending}
        onClick={() => (ref.current ? ref.current.showModal() : setMounted(true))}
      >
        {trigger}
      </button>
      {mounted && (
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        // The dialog element itself is only the backdrop's hit area: its content lives in the padded div below, so a click
        // whose target is the dialog is a click on the dim area around it.
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className="sheet-dialog"
      >
        <div className="px-4 pb-[calc(1.125rem+env(safe-area-inset-bottom))] pt-2.5 md:p-5">
          <span className="sheet-grab" aria-hidden />
          <h2 id={titleId} className="sheet-title">
            {title}
          </h2>
          {body && <p className="sub mt-1.5 leading-relaxed">{body}</p>}
          {warnings && warnings.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 rounded-2xl bg-warn-soft py-2.5 pl-8 pr-3.5 text-[13px] font-bold text-warn">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {/* The design's order: the destructive choice is a quiet red ghost with a bin, the safe choice the gold pill
              under it (on phones; side by side from md up). A neutral action (archive, lock) keeps gold on the confirm. */}
          <div className="mt-5 flex flex-col gap-2 md:flex-row-reverse md:justify-start">
            <button
              type="button"
              className={tone === "danger" ? "btn-primary w-full md:w-auto" : "btn w-full md:w-auto"}
              onClick={() => ref.current?.close()}
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={pending}
              className={tone === "danger" ? "btn-danger w-full font-extrabold md:w-auto" : "btn-primary w-full md:w-auto"}
            >
              {tone === "danger" && <DuoIcon name="trash" size={18} aria-hidden />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
      )}
    </>
  );
}
