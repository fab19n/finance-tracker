"use client";

import { createContext, useContext, useRef, useState, useTransition, type ComponentProps, type FormEvent } from "react";
import { isUnreachable, UNREACHABLE_MESSAGE } from "@/lib/offline/unreachable";

const PendingContext = createContext(false);

/** True while the surrounding <ActionForm> is sending. `SubmitButton` and `ConfirmSubmit` read it to dim themselves. */
export const useActionPending = () => useContext(PendingContext);

/**
 * A <form> for a Server Action that survives the PC being out of reach.
 *
 * - While it runs, `useActionPending()` is true (buttons dim and show their pending text) and a second submit is ignored,
 *   so a double tap on "Mark paid" can't send twice.
 * - A failed fetch (PC asleep, Tailscale off, a proxy's 502/503/504) no longer crashes the page: an inline banner says
 *   the PC could not be reached, with "Try again", and what was typed stays (the form is not reset).
 * - Validation errors still come back as the action's own `redirect(...?error=)`, which Next handles as before. Any other
 *   thrown error still reaches the error boundary.
 *
 * It submits through onSubmit (not the `action` prop) on purpose: React clears an uncontrolled form after an action
 * finishes, which would throw away what the person typed exactly when they need to try again. The form is cleared by hand
 * only after a send that succeeded.
 */
export function ActionForm({
  action,
  children,
  ...rest
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & { action: (formData: FormData) => void | Promise<void> }) {
  const [pending, startTransition] = useTransition();
  const [unreachable, setUnreachable] = useState(false);
  const [, setCrash] = useState(0);
  const busy = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current) return;
    const form = e.currentTarget;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(form, submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : undefined);
    busy.current = true;
    setUnreachable(false);
    // A confirmation sheet inside the form closes, so the banner underneath is visible if the send fails.
    form.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close());
    startTransition(async () => {
      try {
        await action(data);
        // A successful save redirects back to this same page, so the form is not remounted: clear what was typed (an add
        // form would otherwise keep its values and a second tap would add a duplicate). A validation error comes back as
        // ?error= and keeps the values so they can be corrected.
        await new Promise((r) => setTimeout(r, 60));
        if (formRef.current && !new URLSearchParams(window.location.search).has("error")) formRef.current.reset();
      } catch (error) {
        if (isUnreachable(error)) setUnreachable(true);
        else
          setCrash(() => {
            throw error; // to the error boundary, as it would have without this wrapper
          });
      } finally {
        busy.current = false;
      }
    });
  }

  return (
    <PendingContext.Provider value={pending}>
      <form {...rest} ref={formRef} onSubmit={onSubmit} aria-busy={pending || undefined}>
        {children}
        {unreachable && (
          <p role="alert" className="banner banner-danger col-span-full flex-wrap items-center">
            <span className="min-w-0 flex-1">{UNREACHABLE_MESSAGE}</span>
            <button type="button" className="btn min-h-11" onClick={() => formRef.current?.requestSubmit()}>
              Try again
            </button>
          </p>
        )}
      </form>
    </PendingContext.Provider>
  );
}
