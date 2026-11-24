"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { undoImport } from "@/app/actions/import";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";

/** "Undo this import": asks first, names how many entries go, and says plainly what it did. */
export function UndoImport({ batchId, count, accountName, transfers = 0, onUndone }: { batchId: string; count: number; accountName: string; transfers?: number; onUndone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "good" | "danger"; text: string } | null>(null);

  if (message?.tone === "good") {
    return (
      <p role="status" className="banner banner-good leading-snug">
        {message.text}
      </p>
    );
  }
  const entries = `${count} ${count === 1 ? "entry" : "entries"}`;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        start(async () => {
          try {
            const res = await undoImport(batchId);
            if (res.ok) {
              setMessage({ tone: "good", text: `Import undone: ${res.removed} ${res.removed === 1 ? "entry" : "entries"} removed${res.openingRestored ? " and the starting balance put back" : ""}.` });
              onUndone?.();
              router.refresh();
            } else {
              setMessage({ tone: "danger", text: res.error });
            }
          } catch {
            setMessage({ tone: "danger", text: "Couldn't reach your PC. Nothing was undone." });
          }
        });
      }}
    >
      <ConfirmSubmit
        trigger={
          <>
            <Undo2 size={14} strokeWidth={2.5} aria-hidden /> Undo this import
          </>
        }
        triggerClassName="btn"
        disabled={pending}
        title={`Undo this import of ${entries}?`}
        body={`This removes the ${entries} it added to ${accountName}, including any you have changed since, and puts the starting balance back if the import set it. Rules the app learned stay.${transfers > 0 ? ` ${transfers === 1 ? "One of them is a transfer" : `${transfers} of them are transfers`}: ${transfers === 1 ? "it" : "they"} also disappear from the other account's books, so check that account afterwards.` : ""} It can't be redone; to bring them back, import the statement again.`}
        confirmLabel={`Remove ${entries}`}
      />
      {message && (
        <p role="alert" className="banner banner-danger leading-snug">
          {message.text}
        </p>
      )}
    </form>
  );
}
