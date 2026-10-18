"use client";

import { Trash2 } from "lucide-react";
import { ConfirmSubmit } from "./ConfirmSubmit";

/** The bin button on an entry: asks first, then submits the surrounding <form action>. */
export function DeleteButton({ label = "Delete this entry?" }: { label?: string }) {
  return (
    <ConfirmSubmit
      trigger={<Trash2 size={15} />}
      triggerLabel="Delete"
      triggerClassName="grid size-9 place-items-center rounded-full text-muted transition hover:bg-danger-soft hover:text-danger"
      title={label}
      body="It will be removed from your books. This can't be undone."
      confirmLabel="Delete"
    />
  );
}
