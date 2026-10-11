"use client";

import { TransactionForm, type EntryDraft, type TransactionFormProps } from "@/components/TransactionForm";
import { useOfflineState } from "./hooks";

/**
 * The Add form, which turns into "correct this entry" when you tap Edit on one waiting in the outbox. The form is simply
 * mounted afresh (new key) with that entry's values, so there is no state to sync by hand, and Cancel just drops the key back.
 */
export function AddEntry(props: Omit<TransactionFormProps, "draft" | "initial">) {
  const s = useOfflineState();
  const editing = s.editingId ? s.entries.find((e) => e.entry.clientId === s.editingId) : undefined;
  const draft: EntryDraft | undefined = editing && {
    clientId: editing.entry.clientId,
    type: editing.entry.type,
    amount: editing.entry.amount,
    date: editing.entry.date,
    accountId: editing.entry.accountId,
    toAccountId: editing.entry.toAccountId,
    categoryId: editing.entry.categoryId,
    item: editing.entry.item,
    note: editing.entry.note,
    error: editing.error,
  };
  return (
    <div id="add-entry" className="scroll-mt-20">
      <TransactionForm key={draft?.clientId ?? "new"} {...props} draft={draft} />
    </div>
  );
}
