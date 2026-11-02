import { AccountChips } from "@/components/AccountChips";
import { AddEntry } from "@/components/offline/AddEntry";
import { OutboxList } from "@/components/offline/OutboxList";
import { PageHeader } from "@/components/PageHeader";
import { SafeToSpendCard } from "@/components/plan/SafeToSpendCard";
import { TransactionRow } from "@/components/TransactionRow";
import { todayISO } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import { lastAccountId, listCategories, listItemHints } from "@/lib/queries/reference";
import { getPlan } from "@/lib/queries/plan";
import { listTransactions, sumTransactions } from "@/lib/queries/transactions";

/** Balances as small pills; a tap opens that account's entries (Activity, this month). */
function Balances({ accounts }: { accounts: { id: number; name: string; balance: number }[] }) {
  return <AccountChips label="Account balances: tap one to see its entries" accounts={accounts.map((a) => ({ ...a, href: `/transactions?account=${a.id}` }))} />;
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
  const { cycle } = plan;
  const toPayday = cycle.paydayOverdue ? "Payday due" : `${cycle.daysLeft} day${cycle.daysLeft === 1 ? "" : "s"} to payday`;

  return (
    <div className="mx-auto max-w-5xl space-y-4 md:space-y-5">
      <PageHeader
        title="Add entry"
        subtitle={
          <>
            <span className="md:hidden">{cycle.paydayOverdue ? toPayday : `Day ${cycle.dayNumber} of ${cycle.daysTotal} · ${toPayday}`}</span>
            <span className="hidden md:inline">Record spending, income or a transfer</span>
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,27.5rem)_minmax(0,1fr)] md:items-start md:gap-4">
        {/* Phone, top to bottom: the card, balances, the form, then (next section) waiting entries and Today. The card and
            the balances are drawn once per size, never twice: here on a phone, in the right-hand column on a desktop,
            where the form comes first on the left. */}
        <section className="space-y-3">
          <div className="space-y-3 md:hidden">
            <SafeToSpendCard safe={plan.safe} cycle={plan.cycle} compact />
            <Balances accounts={spendable} />
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

        <section className="space-y-3">
          <div className="hidden space-y-3 md:block">
            <SafeToSpendCard safe={plan.safe} cycle={plan.cycle} compact />
            <Balances accounts={spendable} />
          </div>
          <OutboxList />
          <div className="flex items-baseline justify-between gap-3 px-1 pt-1">
            <h2 className="h2">Today</h2>
            <p className="num sub">
              Spent <span className="font-extrabold text-foreground">{formatRM(totals.expense)}</span>
              {totals.income > 0 && (
                <>
                  {" "}
                  · In <span className="font-extrabold text-good">{formatRM(totals.income)}</span>
                </>
              )}
            </p>
          </div>
          {todays.length === 0 ? (
            <div className="card text-center">
              <p className="text-sm font-black">Nothing recorded today yet.</p>
              <p className="sub mt-1">Every ringgit counts - log your first one.</p>
            </div>
          ) : (
            <ul className="space-y-2">
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
