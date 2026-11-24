import { Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { deleteTransaction } from "@/app/actions/transactions";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { PageHeader } from "@/components/PageHeader";
import { safeBackPath } from "@/lib/back";
import { TransactionForm } from "@/components/TransactionForm";
import { getAccountBalances } from "@/lib/queries/accounts";
import { listCategories, listItemHints } from "@/lib/queries/reference";
import { getTransaction } from "@/lib/queries/transactions";
import { todayISO } from "@/lib/dates";

export default async function EditTransactionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string | string[] }> }) {
  const id = Number((await params).id);
  // Where the entry was opened from (an Activity list with its filters, the Add page): Back, Save and Delete return there.
  const rawBack = (await searchParams).back;
  const back = safeBackPath(Array.isArray(rawBack) ? rawBack[0] : rawBack) ?? "/transactions";
  if (!Number.isInteger(id) || id <= 0) notFound();
  const tx = await getTransaction(id);
  if (!tx) notFound();
  const [accounts, categories, hints] = await Promise.all([
    getAccountBalances(true),
    listCategories(true),
    listItemHints(),
  ]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title="Edit entry" back={{ href: back, label: back === "/" ? "Back to Add" : back.startsWith("/accounts/") ? "Back to the account" : "Back to Activity" }} />
      <TransactionForm
        accounts={accounts
          .filter((a) => !a.archived || a.id === tx.accountId || a.id === tx.toAccountId)
          .map((a) => ({ id: a.id, name: a.name, type: a.type, balance: a.balance, cardColor: a.cardColor, cardNetwork: a.cardNetwork }))}
        categories={categories
          .filter((c) => !c.archived || c.id === tx.categoryId)
          .map((c) => ({ id: c.id, name: c.name, type: c.type, color: c.color, icon: c.icon }))}
        hints={hints}
        defaultDate={todayISO()}
        defaultAccountId={tx.accountId}
        backHref={back}
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
        <input type="hidden" name="next" value={back} />
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
