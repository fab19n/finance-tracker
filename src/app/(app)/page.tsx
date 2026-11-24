import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountChips } from "@/components/AccountChips";
import { AddEntry } from "@/components/offline/AddEntry";
import { OutboxList } from "@/components/offline/OutboxList";
import { SetupCard } from "@/components/setup/SetupCard";
import { PageHeader } from "@/components/PageHeader";
import { SafeToSpendCard } from "@/components/plan/SafeToSpendCard";
import { TransactionRow } from "@/components/TransactionRow";
import { todayISO } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { getAccountBalances, type AccountBalance } from "@/lib/queries/accounts";
import { lastAccountId, listCategories, listItemHints } from "@/lib/queries/reference";
import { setupFacts } from "@/lib/setup";
import { getPlan } from "@/lib/queries/plan";
import { getTransaction, listTransactions, sumTransactions } from "@/lib/queries/transactions";

/** Balances as small pills; a tap opens that account's entries (Activity, this month). */
function Balances({ accounts }: { accounts: { id: number; name: string; balance: number }[] }) {
  return <AccountChips label="Account balances: tap one to see its entries" accounts={accounts.map((a) => ({ ...a, href: `/transactions?account=${a.id}` }))} />;
}

export const metadata: Metadata = { title: "Add entry" };

/**
 * The setup checklist and the "left to spend" line. They need the whole payday plan (bills, cycles, savings), which is the
 * slow part of this page, so they stream in after the form instead of holding it back.
 */
async function PlanStrip({ balances, today }: { balances: AccountBalance[]; today: string }) {
  const [plan, anyEntry] = await Promise.all([getPlan(today), listTransactions({ limit: 1 })]);
  const facts = setupFacts({ accounts: balances, hasSalary: plan.hasSalary, expectedIncome: plan.settings.expectedIncome, hasEntries: anyEntry.length > 0 });
  return (
    <>
      <SetupCard facts={facts} />
      {/* One quiet line, not a card (the Entry board): what is left to spend and how long until payday. */}
      <SafeToSpendCard safe={plan.safe} cycle={plan.cycle} compact />
    </>
  );
}

export default async function AddPage({ searchParams }: { searchParams: Promise<{ copy?: string | string[] }> }) {
  const rawCopy = (await searchParams).copy;
  const copyId = Number(Array.isArray(rawCopy) ? rawCopy[0] : rawCopy);
  const [balances, categories, hints, lastAcc, copied] = await Promise.all([
    getAccountBalances(),
    listCategories(),
    listItemHints(),
    lastAccountId("expense"),
    Number.isInteger(copyId) && copyId > 0 ? getTransaction(copyId) : Promise.resolve(undefined),
  ]);
  const today = todayISO(); // safe: getDb() already deferred this render to request time
  const [todays, totals] = await Promise.all([
    listTransactions({ from: today, to: today, limit: 100 }),
    sumTransactions({ from: today, to: today }),
  ]);

  // Where the form starts: the account of your last TYPED expense (a bank import says nothing about habit), else the account
  // marked Main (spending), else the first one you can spend from.
  const spendable = balances.filter((a) => a.type !== "investment");
  const defaultAccountId =
    (lastAcc && spendable.some((a) => a.id === lastAcc) ? lastAcc : (spendable.find((a) => a.purpose === "spending") ?? spendable[0])?.id) ?? 0;
  // "Duplicate" on an entry opens Add with its fields filled in (today's date; the bank's own text is not copied).
  const prefill = copied
    ? { type: copied.type, amount: copied.amount, accountId: copied.accountId, toAccountId: copied.toAccountId, categoryId: copied.categoryId, item: copied.item, note: copied.imported ? null : copied.note }
    : undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-4 md:space-y-5">
      <PageHeader
        title="Add entry"
        subtitle={<span className="hidden md:inline">Record spending, income or a transfer</span>}
      />
      {/* Held a place of about the same height while it loads, so the form does not jump down when it arrives. */}
      <Suspense fallback={<div aria-hidden className="min-h-11" />}>
        <PlanStrip balances={balances} today={today} />
      </Suspense>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,27.5rem)_minmax(0,1fr)] md:items-start md:gap-4">
        {/* Phone, top to bottom: the form, then waiting entries, the balances and Today. The balances are drawn once: the
            account cards in the form already show them, these pills are the way in to each account's entries. */}
        <section className="space-y-3">
          <AddEntry
            key={prefill ? `copy-${copied?.id}` : "new"}
            prefill={prefill}
            accounts={balances.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              balance: a.balance,
              cardColor: a.cardColor,
              cardNetwork: a.cardNetwork,
            }))}
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
          <OutboxList />
          <Balances accounts={spendable} />
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
                <TransactionRow key={t.id} tx={t} backHref="/" />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
