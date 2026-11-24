"use client";

import { Trash2 } from "lucide-react";
import { deleteEntry } from "@/app/actions/transactions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteSheet, type DeletableEntry } from "@/lib/entry-delete";
import { rememberUndo } from "./undo-store";

/**
 * Deletes one entry and leaves an "Entry deleted. Undo" notice behind. `variant="icon"` is the bin on a list row (stays on
 * the list; the notice appears at once); `variant="button"` is the full "Delete this entry" button on the entry's own page,
 * where `next` is the place to go afterwards (the server redirects there with the undo token in the address).
 */
export function DeleteEntryForm({
  id,
  entry,
  next,
  variant,
  className,
}: {
  id: number;
  entry: DeletableEntry;
  next?: string;
  variant: "icon" | "button";
  className?: string;
}) {
  async function run(data: FormData) {
    const result = await deleteEntry(data);
    if (result.undo) rememberUndo(result.undo);
  }
  const sheet = deleteSheet(entry);
  return (
    <ActionForm action={run} className={className}>
      <input type="hidden" name="id" value={id} />
      {next && <input type="hidden" name="next" value={next} />}
      {variant === "icon" ? (
        <DeleteButton entry={entry} />
      ) : (
        <ConfirmSubmit
          trigger={
            <>
              <Trash2 size={16} aria-hidden /> Delete this entry
            </>
          }
          triggerClassName="btn-danger"
          title={sheet.title}
          body={sheet.body}
          warnings={sheet.warnings}
          confirmLabel="Delete"
        />
      )}
    </ActionForm>
  );
}
