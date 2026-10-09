"use client";

import { Trash2 } from "lucide-react";

/** Submit button that asks for confirmation before the surrounding <form action> runs. */
export function DeleteButton({ label = "Delete this entry?" }: { label?: string }) {
  return (
    <button
      type="submit"
      aria-label="Delete"
      title="Delete"
      className="rounded-lg p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger"
      onClick={(e) => {
        if (!window.confirm(label)) e.preventDefault();
      }}
    >
      <Trash2 size={16} />
    </button>
  );
}
