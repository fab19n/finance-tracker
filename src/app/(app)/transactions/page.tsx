import { Download, X } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { ActivitySearch } from "@/components/activity/ActivitySearch";
import { FilterSheet } from "@/components/activity/FilterSheet";
import { MonthNav } from "@/components/MonthNav";
import { PageHeader } from "@/components/PageHeader";
import { TransactionRow } from "@/components/TransactionRow";
import { currentMonth, dayLabel, monthLabel } from "@/lib/dates";
import { formatRM, formatRMWhole } from "@/lib/money";
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
  const net = totals.income - totals.expense;

  return (
    <div className="space-y-3">
      <PageHeader
        title="Activity"
        subtitle={`${monthNav ? monthLabel(view.month) : "All time"} · ${totals.count} ${totals.count === 1 ? "entry" : "entries"}`}
        actions={
          <Link href={`/transactions/export${qs(base)}`} className="btn" prefetch={false}>
            <Download size={14} strokeWidth={2.5} aria-hidden />
            <span className="md:hidden">CSV</span>
            <span className="hidden md:inline">Export CSV</span>
          </Link>
        }
      />

      {monthNav ? (
        <MonthNav
          month={view.month}
          maxMonth={currentMonth()}
          path="/transactions"
          query={new URLSearchParams(present({ q: base.q, category, account, type })).toString()}
          sublabel={
            <Link href={qs({ ...base, month: "all" })} className="font-extrabold text-accent-strong hover:underline">
              Show all time
            </Link>
          }
          className="max-w-sm"
        />
      ) : (
        <div className="max-w-sm rounded-full border-[1.5px] border-line bg-card px-4 py-2 text-center">
          <p className="text-xs font-extrabold">All time</p>
          <Link href={qs({ ...base, month: undefined })} className="text-[11px] font-extrabold text-accent-strong hover:underline">
            Back to monthly
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="md:w-80 md:shrink-0">
          <ActivitySearch q={q} others={present({ month: view.month, type, category, account })} />
        </div>
        <div className="no-scrollbar -mx-5 flex items-center gap-1.5 overflow-x-auto px-5 pb-0.5 md:mx-0 md:px-0" role="group" aria-label="Type">
          {TYPES.map(([value, label]) => (
            <Link key={label} href={qs({ ...base, type: value })} aria-current={type === value ? "true" : undefined} className="chip">
              {label}
            </Link>
          ))}
          <FilterSheet
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
            category={category}
            account={account}
            others={present({ month: view.month, type, q: base.q })}
            clearHref={qs({ ...base, category: undefined, account: undefined })}
          />
        </div>
      </div>

      {filtered && (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Applied filters">
          {q.trim() && (
            <li>
              <Link href={qs({ ...base, q: undefined })} className="pill bg-accent-soft text-accent-strong">
                Search: {q.trim()} <X size={12} aria-label="Remove" />
              </Link>
            </li>
          )}
          {categoryChoice && (
            <li>
              <Link href={qs({ ...base, category: undefined })} className="pill bg-accent-soft text-accent-strong">
                {categoryChoice.name} <X size={12} aria-label="Remove" />
              </Link>
            </li>
          )}
          {accountChoice && (
            <li>
              <Link href={qs({ ...base, account: undefined })} className="pill bg-accent-soft text-accent-strong">
                {accountChoice.name} <X size={12} aria-label="Remove" />
              </Link>
            </li>
          )}
        </ul>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-[20px] bg-card px-3 py-3.5 md:p-[22px]">
          <p className="text-[11px] font-extrabold text-muted md:text-xs">Income</p>
          <p className="num text-sm font-black text-good md:mt-1 md:text-[22px]">{formatRMWhole(totals.income)}</p>
        </div>
        <div className="rounded-[20px] bg-card px-3 py-3.5 md:p-[22px]">
          <p className="text-[11px] font-extrabold text-muted md:text-xs">Spent</p>
          <p className="num text-sm font-black md:mt-1 md:text-[22px]">{formatRMWhole(totals.expense)}</p>
        </div>
        <div className="rounded-[20px] bg-card px-3 py-3.5 md:p-[22px]">
          <p className="text-[11px] font-extrabold text-muted md:text-xs">Net</p>
          <p className={`num text-sm font-black md:mt-1 md:text-[22px] ${net < 0 ? "text-danger" : "text-good"}`}>
            {net < 0 ? "−" : "+"}
            {formatRMWhole(Math.abs(net))}
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card py-10 text-center">
          <p className="text-sm font-black">No entries match.</p>
          <p className="sub mt-1">{filtered ? "Try clearing the filters or searching all time." : "Nothing has been recorded for this period yet."}</p>
        </div>
      ) : (
        groups.map((g) => {
          const spent = g.items.filter((i) => i.type === "expense").reduce((s, i) => s + i.amount, 0);
          return (
            <section key={g.date}>
              <div className="flex items-baseline justify-between px-1 pb-2 pt-1">
                <h2 className="text-[13px] font-black">{dayLabel(g.date)}</h2>
                {spent > 0 && <span className="num sub !text-[11px]">Spent {formatRM(spent)}</span>}
              </div>
              <ul className="space-y-1.5">
                {g.items.map((t) => (
                  <TransactionRow key={t.id} tx={t} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {(view.page > 1 || hasNext) && (
        <div className="flex items-center justify-between">
          {view.page > 1 ? (
            <Link href={qs({ ...base, page: view.page - 1 })} className="btn">
              ‹ Newer
            </Link>
          ) : (
            <span />
          )}
          {hasNext && (
            <Link href={qs({ ...base, page: view.page + 1 })} className="btn">
              Older ›
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
