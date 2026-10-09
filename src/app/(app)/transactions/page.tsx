import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import Link from "next/link";
import { TransactionRow } from "@/components/TransactionRow";
import { dayLabel, monthLabel, shiftMonth } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { parseTxSearch, qs, type SearchParams } from "@/lib/queries/filters";
import { listAccounts, listCategories } from "@/lib/queries/reference";
import { listTransactions, sumTransactions, type TxRow } from "@/lib/queries/transactions";

const PAGE_SIZE = 100;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const view = parseTxSearch(await searchParams);
  const [accounts, categories, rows, totals] = await Promise.all([
    listAccounts(true),
    listCategories(true),
    listTransactions({ ...view.filters, limit: PAGE_SIZE + 1, offset: (view.page - 1) * PAGE_SIZE }),
    sumTransactions(view.filters),
  ]);
  const hasNext = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);

  // Group by day, newest first (rows are already ordered).
  const groups: { date: string; items: TxRow[] }[] = [];
  for (const r of pageRows) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.date) last.items.push(r);
    else groups.push({ date: r.date, items: [r] });
  }

  const base = {
    month: view.month,
    q: view.raw.q,
    category: view.raw.category,
    account: view.raw.account,
    type: view.raw.type,
  };
  const monthNav = view.month !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h-page">Activity</h1>
        <Link href={`/transactions/export${qs(base)}`} className="btn" prefetch={false}>
          <Download size={16} /> Export CSV
        </Link>
      </div>

      <div className="flex items-center justify-between gap-2">
        {monthNav ? (
          <div className="flex items-center gap-1">
            <Link
              href={qs({ ...base, month: shiftMonth(view.month, -1) })}
              aria-label="Previous month"
              className="btn !px-2.5"
            >
              <ChevronLeft size={18} />
            </Link>
            <span className="min-w-36 text-center font-semibold">{monthLabel(view.month)}</span>
            <Link
              href={qs({ ...base, month: shiftMonth(view.month, 1) })}
              aria-label="Next month"
              className="btn !px-2.5"
            >
              <ChevronRight size={18} />
            </Link>
          </div>
        ) : (
          <span className="font-semibold">All time</span>
        )}
        <Link href={qs({ ...base, month: monthNav ? "all" : undefined })} className="text-sm font-medium text-accent">
          {monthNav ? "Show all time" : "Back to monthly"}
        </Link>
      </div>

      <form method="get" className="card grid grid-cols-2 gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <input type="hidden" name="month" value={view.month} />
        <div className="relative col-span-2 md:col-span-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={view.raw.q} placeholder="Search item, note, category" className="input !pl-9" />
        </div>
        <select name="category" defaultValue={view.raw.category} className="input" aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <select name="account" defaultValue={view.raw.account} className="input" aria-label="Account">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={view.raw.type} className="input" aria-label="Type">
          <option value="">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="transfer">Transfers</option>
        </select>
        <button className="btn-primary !py-2.5 text-sm">Filter</button>
      </form>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card !p-3">
          <p className="text-xs text-muted">Income</p>
          <p className="num font-semibold text-income">{formatRM(totals.income)}</p>
        </div>
        <div className="card !p-3">
          <p className="text-xs text-muted">Spent</p>
          <p className="num font-semibold">{formatRM(totals.expense)}</p>
        </div>
        <div className="card !p-3">
          <p className="text-xs text-muted">Net</p>
          <p className={`num font-semibold ${totals.income - totals.expense < 0 ? "text-danger" : ""}`}>
            {formatRM(totals.income - totals.expense)}
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card text-center text-sm text-muted">No entries match.</div>
      ) : (
        groups.map((g) => {
          const spent = g.items.filter((i) => i.type === "expense").reduce((s, i) => s + i.amount, 0);
          return (
            <section key={g.date}>
              <div className="mb-1 flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold">{dayLabel(g.date)}</h2>
                {spent > 0 && <span className="num text-xs text-muted">spent {formatRM(spent)}</span>}
              </div>
              <ul className="card divide-y divide-line !py-1">
                {g.items.map((t) => (
                  <TransactionRow key={t.id} tx={t} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {(view.page > 1 || hasNext) && (
        <div className="flex justify-between">
          {view.page > 1 ? (
            <Link href={qs({ ...base, page: view.page - 1 })} className="btn">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          {hasNext && (
            <Link href={qs({ ...base, page: view.page + 1 })} className="btn">
              Older →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
