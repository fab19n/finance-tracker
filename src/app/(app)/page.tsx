import { AddEntry } from "@/components/offline/AddEntry";
import { OutboxList } from "@/components/offline/OutboxList";
import { SafeToSpendCard } from "@/components/plan/SafeToSpendCard";
import { TransactionRow } from "@/components/TransactionRow";
import { todayISO } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import { lastAccountId, listCategories, listItemHints } from "@/lib/queries/reference";
import { getPlan } from "@/lib/queries/plan";
import { listTransactions, sumTransactions } from "@/lib/queries/transactions";

function AccountChips({ accounts }: { accounts: { id: number; name: string; balance: number }[] }) {
  return (
    <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Account balances">
      {accounts.map((a) => (
        <li key={a.id} className="card min-w-32 shrink-0 !rounded-xl !p-3">
          <p className="truncate text-[11px] font-medium text-muted">{a.name}</p>
          <p className={`num text-sm font-bold ${a.balance < 0 ? "text-danger" : ""}`}>{formatRM(a.balance)}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function AddPage() {
  const [balances, categories, hints, lastAcc] = await Promise.all([
    getAccountBalances(),
    listCategories(),
    listItemHints(),
    lastAccountId(),
  ]);
  const today = todayISO(); // safe: getDb() already deferred this render to request time
  const plan = await getPlan(today);
  const [todays, totals] = await Promise.all([
    listTransactions({ from: today, to: today, limit: 100 }),
    sumTransactions({ from: today, to: today }),
  ]);

  const spendable = balances.filter((a) => a.type !== "investment");
  const defaultAccountId =
    (lastAcc && spendable.some((a) => a.id === lastAcc) ? lastAcc : spendable[0]?.id) ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="h-page mb-5">Add entry</h1>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:items-start">
        {/* Phone, top to bottom: the compact card, balances, the form, then (next section) waiting entries and Today. The
            form comes first so the amount is on screen without scrolling. Desktop: the form on the left, everything else
            on the right (so the card and the balances are drawn once per size, never twice). */}
        <section className="space-y-4">
          <div className="space-y-4 md:hidden">
            <SafeToSpendCard safe={plan.safe} cycle={plan.cycle} compact />
            <AccountChips accounts={spendable} />
          </div>
          <AddEntry
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

        <section className="space-y-4">
          <div className="hidden space-y-4 md:block">
            <SafeToSpendCard safe={plan.safe} cycle={plan.cycle} />
            <AccountChips accounts={spendable} />
          </div>
          <OutboxList />
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold">Today</h2>
            <p className="num text-xs text-muted">
              Spent <span className="font-bold text-foreground">{formatRM(totals.expense)}</span>
              {totals.income > 0 && (
                <>
                  {" "}
                  · In <span className="font-bold text-income">{formatRM(totals.income)}</span>
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
    </div>
  );
}
