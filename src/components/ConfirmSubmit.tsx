"use client";

import { useId, useRef, type ReactNode } from "react";

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
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for things that can't be undone; "neutral" for ones that can (archive, lock). */
  tone?: "danger" | "neutral";
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        title={triggerLabel}
        disabled={disabled}
        onClick={() => ref.current?.showModal()}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        // The dialog element itself is only the backdrop's hit area: its content lives in the padded div below, so a click
        // whose target is the dialog is a click on the dim area around it.
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-2xl border border-line bg-card p-0 text-foreground shadow-card backdrop:bg-overlay max-md:mb-0 max-md:w-full max-md:max-w-none max-md:rounded-b-none"
      >
        <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:pb-5">
          <h2 id={titleId} className="text-base font-bold">
            {title}
          </h2>
          {body && <p className="mt-1.5 text-sm text-muted">{body}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              {cancelLabel}
            </button>
            <button
              type="submit"
              className={
                tone === "danger"
                  ? "inline-flex items-center justify-center rounded-xl bg-danger px-4 py-3 text-sm font-bold text-background transition hover:opacity-90"
                  : "btn-primary !py-3 !text-sm"
              }
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
