"use client";

import { ActionForm } from "@/components/ActionForm";
import { Toggle } from "@/components/Toggle";

/**
 * "Archived" as a switch that is on: turning it off restores the account or category at once (the same Server Action as the
 * old "Restore" button, which posts `id` and `archived=0`). Archiving stays a button with a confirmation sheet, because it is
 * the one that changes what the rest of the app shows.
 */
export function RestoreSwitch({ action, id, what }: { action: (formData: FormData) => void | Promise<void>; id: number; what: string }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value="0" />
      <Toggle
        label="Archived"
        hint={`Switch off to restore ${what}`}
        defaultChecked
        onChange={(e) => {
          if (!e.currentTarget.checked) e.currentTarget.form?.requestSubmit();
        }}
      />
    </ActionForm>
  );
}
