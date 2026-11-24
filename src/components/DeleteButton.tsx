"use client";

import { Trash2 } from "lucide-react";
import { deleteSheet, entryName, type DeletableEntry } from "@/lib/entry-delete";
import { ConfirmSubmit } from "./ConfirmSubmit";

/**
 * The bin button on an entry: asks first, then submits the surrounding <form action>. Given the entry, its label says WHICH
 * one ("Delete teh tarik, RM 3.50"), and the sheet repeats the entry, its date and anything the delete would also undo (a
 * bill left unpaid, a person owing again, a bank import that would bring it back). A 44 px target.
 */
export function DeleteButton({ entry, label = "Delete this entry?" }: { entry?: DeletableEntry; label?: string }) {
  const sheet = entry ? deleteSheet(entry) : null;
  return (
    <ConfirmSubmit
      trigger={<Trash2 size={16} aria-hidden />}
      triggerLabel={entry ? `Delete ${entryName(entry)}` : "Delete"}
      triggerClassName="grid size-11 place-items-center rounded-full text-muted transition hover:bg-danger-soft hover:text-danger"
      title={sheet?.title ?? label}
      body={sheet?.body ?? "It will be removed from your books. This can't be undone."}
      warnings={sheet?.warnings}
      confirmLabel="Delete"
    />
  );
}
