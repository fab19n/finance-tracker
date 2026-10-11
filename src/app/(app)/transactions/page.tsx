import { Download, X } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { ActivitySearch } from "@/components/activity/ActivitySearch";
import { FilterSheet } from "@/components/activity/FilterSheet";
import { MonthNav } from "@/components/MonthNav";
import { TransactionRow } from "@/components/TransactionRow";
import { currentMonth, dayLabel } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { parseTxSearch, qs, type SearchParams } from "@/lib/queries/filters";
import { listAccounts, listCategories } from "@/lib/queries/reference";
import { listTransactions, sumTransactions, type TxRow } from "@/lib/queries/transactions";

const PAGE_SIZE = 100;

const TYPES = [
  ["", "All"],
  ["expense", "Expense"],
  ["income", "Income"],
  ["transfer", "Transfer"],
] as const;

/** Drop empty values so the rest can be written into hidden form fields or a query string. */
const present = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ""));

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // parseTxSearch defaults the month to "now", so the render must already be at request time (see src/lib/dates.ts).
  await connection();
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
  const { q, category, account, type } = view.raw;
  const categoryChoice = categories.find((c) => String(c.id) === category);
  const accountChoice = accounts.find((a) => String(a.id) === account);
  const filtered = Boolean(category || account || q.trim());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 max-md:justify-end">
        <h1 className="h-page">Activity</h1>
        <Link href={`/transactions/export${qs(base)}`} className="btn !px-3.5 !py-2" prefetch={false}>
          <Download size={16} aria-hidden /> Export CSV
        </Link>
      </div>

      {monthNav ? (
        <MonthNav
          month={view.month}
          maxMonth={currentMonth()}
          path="/transactions"
          query={new URLSearchParams(present({ q: base.q, category, account, type })).toString()}
          sublabel={
            <Link href={qs({ ...base, month: "all" })} className="font-semibold text-accent hover:underline">
              Show all time
            </Link>
          }
          className="mx-auto max-w-sm"
        />
      ) : (
        <div className="text-center">
          <p className="text-[15px] font-bold">All time</p>
          <Link href={qs({ ...base, month: undefined })} className="text-xs font-semibold text-accent hover:underline">
            Back to monthly
          </Link>
        </div>
      )}

      <ActivitySearch q={q} others={present({ month: view.month, type, category, account })} />

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="group" aria-label="Type">
        {TYPES.map(([value, label]) => (
          <Link
            key={label}
            href={qs({ ...base, type: value })}
            aria-current={type === value ? "true" : undefined}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-sm transition ${
              type === value ? "border-accent bg-accent-soft font-bold text-accent" : "border-line bg-card font-medium text-muted hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        ))}
        <FilterSheet
          categories={categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          category={category}
          account={account}
          others={present({ month: view.month, type, q: base.q })}
          clearHref={qs({ ...base, category: undefined, account: undefined })}
        />
      </div>

      {filtered && (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Applied filters">
          {q.trim() && (
            <li>
              <Link href={qs({ ...base, q: undefined })} className="pill gap-1 bg-accent-soft text-accent">
                Search: {q.trim()} <X size={12} aria-label="Remove" />
              </Link>
            </li>
          )}
          {categoryChoice && (
            <li>
              <Link href={qs({ ...base, category: undefined })} className="pill gap-1 bg-accent-soft text-accent">
                {categoryChoice.icon} {categoryChoice.name} <X size={12} aria-label="Remove" />
              </Link>
            </li>
          )}
          {accountChoice && (
            <li>
              <Link href={qs({ ...base, account: undefined })} className="pill gap-1 bg-accent-soft text-accent">
                {accountChoice.name} <X size={12} aria-label="Remove" />
              </Link>
            </li>
          )}
        </ul>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="card !rounded-xl !p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Income</p>
          <p className="num text-[15px] font-extrabold text-income">{formatRM(totals.income)}</p>
        </div>
        <div className="card !rounded-xl !p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Spent</p>
          <p className="num text-[15px] font-extrabold">{formatRM(totals.expense)}</p>
        </div>
        <div className="card !rounded-xl !p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Net</p>
          <p className={`num text-[15px] font-extrabold ${totals.income - totals.expense < 0 ? "text-danger" : "text-income"}`}>
            {totals.income - totals.expense < 0 ? "−" : "+"}
            {formatRM(Math.abs(totals.income - totals.expense))}
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card text-center text-sm text-muted">
          No entries match.{filtered ? " Try clearing the filters or searching all time." : ""}
        </div>
      ) : (
        groups.map((g) => {
          const spent = g.items.filter((i) => i.type === "expense").reduce((s, i) => s + i.amount, 0);
          return (
            <section key={g.date}>
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <h2 className="text-[13px] font-bold">{dayLabel(g.date)}</h2>
                {spent > 0 && <span className="num text-xs text-muted">Spent {formatRM(spent)}</span>}
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
