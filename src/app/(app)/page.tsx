import { TransactionForm } from "@/components/TransactionForm";
import { TransactionRow } from "@/components/TransactionRow";
import { todayISO } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import { lastAccountId, listCategories, listItemHints } from "@/lib/queries/reference";
import { listTransactions, sumTransactions } from "@/lib/queries/transactions";

export default async function AddPage() {
  const [balances, categories, hints, lastAcc] = await Promise.all([
    getAccountBalances(),
    listCategories(),
    listItemHints(),
    lastAccountId(),
  ]);
  const today = todayISO(); // safe: getDb() already deferred this render to request time
  const [todays, totals] = await Promise.all([
    listTransactions({ from: today, to: today, limit: 100 }),
    sumTransactions({ from: today, to: today }),
  ]);

  const spendable = balances.filter((a) => a.type !== "investment");
  const defaultAccountId =
    (lastAcc && spendable.some((a) => a.id === lastAcc) ? lastAcc : spendable[0]?.id) ?? 0;

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section className="space-y-4">
        <h1 className="h-page">Add entry</h1>
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Account balances">
          {spendable.map((a) => (
            <li key={a.id} className="card min-w-32 shrink-0 !p-3">
              <p className="truncate text-xs text-muted">{a.name}</p>
              <p className={`num text-base font-semibold ${a.balance < 0 ? "text-danger" : ""}`}>
                {formatRM(a.balance)}
              </p>
            </li>
          ))}
        </ul>
        <TransactionForm
          accounts={balances.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            color: c.color,
            icon: c.icon,
          }))}
          hints={hints}
          defaultDate={today}
          defaultAccountId={defaultAccountId}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Today</h2>
          <p className="num text-sm text-muted">
            Spent <span className="font-semibold text-foreground">{formatRM(totals.expense)}</span>
            {totals.income > 0 && (
              <>
                {" "}
                · In <span className="font-semibold text-income">{formatRM(totals.income)}</span>
              </>
            )}
          </p>
        </div>
        {todays.length === 0 ? (
          <div className="card text-center text-sm text-muted">
            Nothing recorded today yet. Every ringgit counts - log your first one.
          </div>
        ) : (
          <ul className="card divide-y divide-line !py-1">
            {todays.map((t) => (
              <TransactionRow key={t.id} tx={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
