"use client";

import { LoaderCircle } from "lucide-react";
import type { ComponentProps } from "react";
import { useActionPending } from "./ActionForm";

/**
 * The submit button of an <ActionForm>: disabled while the action runs, with a spinner and `pendingLabel` ("Saving...")
 * so it is never colour alone. Used on its own (outside an ActionForm) it simply behaves as a button.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn-primary",
  disabled,
  ...rest
}: Omit<ComponentProps<"button">, "type"> & { pendingLabel?: string }) {
  const pending = useActionPending();
  return (
    <button {...rest} type="submit" className={className} disabled={disabled || pending} aria-disabled={disabled || pending || undefined}>
      {pending ? (
        <>
          <LoaderCircle size={14} strokeWidth={2.5} className="animate-spin motion-reduce:animate-none" aria-hidden />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
