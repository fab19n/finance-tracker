import { ChevronLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTransaction } from "@/app/actions/transactions";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { PageHeader } from "@/components/PageHeader";
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
      <PageHeader
        title="Edit entry"
        actions={
          <Link href="/transactions" className="btn">
            <ChevronLeft size={14} strokeWidth={2.5} aria-hidden /> Activity
          </Link>
        }
      />
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
      <form action={deleteTransaction} className="flex justify-center">
        <input type="hidden" name="id" value={tx.id} />
        <input type="hidden" name="next" value="/transactions" />
        <ConfirmSubmit
          trigger={
            <>
              <Trash2 size={16} aria-hidden /> Delete this entry
            </>
          }
          triggerClassName="btn-danger"
          title="Delete this entry?"
          body="It will be removed from your books. This can't be undone."
          confirmLabel="Delete"
        />
      </form>
    </div>
  );
}
