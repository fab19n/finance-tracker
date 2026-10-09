import { notFound } from "next/navigation";
import { TransactionForm } from "@/components/TransactionForm";
import { listAccounts, listCategories, listItemHints } from "@/lib/queries/reference";
import { getTransaction } from "@/lib/queries/transactions";
import { todayISO } from "@/lib/dates";

export default async function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const tx = await getTransaction(id);
  if (!tx) notFound();
  const [accounts, categories, hints] = await Promise.all([
    listAccounts(true),
    listCategories(true),
    listItemHints(),
  ]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="h-page">Edit entry</h1>
      <TransactionForm
        accounts={accounts.filter((a) => !a.archived || a.id === tx.accountId || a.id === tx.toAccountId)}
        categories={categories
          .filter((c) => !c.archived || c.id === tx.categoryId)
          .map((c) => ({ id: c.id, name: c.name, type: c.type, color: c.color, icon: c.icon }))}
        hints={hints}
        defaultDate={todayISO()}
        defaultAccountId={tx.accountId}
        initial={{
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          date: tx.date,
          accountId: tx.accountId,
          toAccountId: tx.toAccountId,
          categoryId: tx.categoryId,
          item: tx.item,
          note: tx.note,
        }}
      />
    </div>
  );
}
