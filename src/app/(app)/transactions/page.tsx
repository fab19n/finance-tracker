import { Download, X } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { AccountChips } from "@/components/AccountChips";
import { ActivitySearch } from "@/components/activity/ActivitySearch";
import { FilterSheet } from "@/components/activity/FilterSheet";
import { MonthNav } from "@/components/MonthNav";
import { PageHeader } from "@/components/PageHeader";
import { TransactionRow } from "@/components/TransactionRow";
import { currentMonth, dayLabel, monthLabel, shortDate } from "@/lib/dates";
import { formatRM, formatRMWhole } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import { parseTxSearch, qs, type SearchParams } from "@/lib/queries/filters";
import { listCategories } from "@/lib/queries/reference";
import { listTransactions, sumTransactions, sumTransferFlow, type TxRow } from "@/lib/queries/transactions";

const PAGE_SIZE = 100;

const TYPES = [
  ["", "All"],
  ["expense", "Expense"],
  ["income", "Income"],
  ["transfer", "Transfer"],
] as const;

/** Drop empty values so the rest can be written into hidden form fields or a query string. */
const present = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ""));

/** A small figure tile (label over a whole-ringgit value). */
function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "danger" }) {
  return (
    <div className="rounded-[20px] bg-card px-3 py-3.5 md:p-[22px]">
      <p className="text-[11px] font-extrabold text-muted md:text-xs">{label}</p>
      <p className={`num text-sm font-black md:mt-1 md:text-[22px] ${tone === "good" ? "text-good" : tone === "danger" ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
}

/** "26 Sep - 25 Oct" for a date range given in the address (either end may be open). */
function rangeText(range: { from: string | null; to: string | null }): string {
  if (range.from && range.to) return `${shortDate(range.from)} - ${shortDate(range.to)}`;
  return range.from ? `From ${shortDate(range.from)}` : `Until ${shortDate(range.to!)}`;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // parseTxSearch defaults the month to "now", so the render must already be at request time (see src/lib/dates.ts).
  await connection();
  const view = parseTxSearch(await searchParams);
  const viewing = view.filters.accountId ?? null;
  const [accounts, categories, rows, totals, flow] = await Promise.all([
    getAccountBalances(true),
    listCategories(true),
    listTransactions({ ...view.filters, limit: PAGE_SIZE + 1, offset: (view.page - 1) * PAGE_SIZE }),
    sumTransactions(view.filters),
    // For one account: what left it and what arrived, by transfer, in the same period.
    viewing === null ? Promise.resolve(null) : sumTransferFlow(view.filters, viewing),
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

  const { range } = view;
  const base = {
    month: view.month,
    q: view.raw.q,
    category: view.raw.category,
    account: view.raw.account,
    type: view.raw.type,
    from: view.raw.from,
    to: view.raw.to,
  };
  // A date range from a link (the Dashboard's pay cycle) replaces the month navigator; otherwise a month, or all time.
  const monthNav = view.month !== "all" && !range;
  const { q, category, account, type } = view.raw;
  const categoryChoice = categories.find((c) => String(c.id) === category);
  const accountChoice = accounts.find((a) => String(a.id) === account);
  const filtered = Boolean(category || account || q.trim());
  const net = totals.income - totals.expense;
  const periodText = range ? rangeText(range) : monthNav ? monthLabel(view.month) : "All time";
  // Every account, plus the chosen one even if it has since been archived.
  const chips = accounts
    .filter((a) => !a.archived || String(a.id) === account)
    .map((a) => ({ id: a.id, name: a.name, balance: a.balance, href: qs({ ...base, account: String(a.id), page: undefined }) }));

  return (
    <div className="space-y-3">
      <PageHeader
        title="Activity"
        subtitle={`${accountChoice ? `${accountChoice.name} · ` : ""}${periodText} · ${totals.count} ${totals.count === 1 ? "entry" : "entries"}`}
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
          <p className="text-xs font-extrabold">{periodText}</p>
          <Link href={qs({ ...base, month: undefined, from: undefined, to: undefined })} className="text-[11px] font-extrabold text-accent-strong hover:underline">
            Back to monthly
          </Link>
        </div>
      )}

      {/* Which account: one tap. Each shows its balance now (always the real balance, whatever period is on screen). */}
      <AccountChips label="Filter by account" accounts={chips} selectedId={accountChoice?.id ?? null} allHref={qs({ ...base, account: undefined, page: undefined })} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="md:w-80 md:shrink-0">
          <ActivitySearch q={q} others={present({ month: view.month, type, category, account, from: base.from, to: base.to })} />
        </div>
        <div className="no-scrollbar -mx-5 flex items-center gap-1.5 overflow-x-auto px-5 pb-0.5 md:mx-0 md:px-0" role="group" aria-label="Type">
          {TYPES.map(([value, label]) => (
            <Link key={label} href={qs({ ...base, type: value })} aria-current={type === value ? "true" : undefined} className="chip">
              {label}
            </Link>
          ))}
          <FilterSheet
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            category={category}
            others={present({ month: view.month, type, q: base.q, account, from: base.from, to: base.to })}
            clearHref={qs({ ...base, category: undefined })}
          />
        </div>
      </div>

      {(q.trim() || categoryChoice) && (
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
        </ul>
      )}

      {/* Only transfers on screen: income and spending would all read zero, so say what moved instead. */}
      {type === "transfer" ? (
        flow ? (
          <div className="grid grid-cols-3 gap-2.5">
            <Tile label="Moved out" value={formatRMWhole(flow.out)} />
            <Tile label="Moved in" value={formatRMWhole(flow.in)} tone="good" />
            {/* Neutral on purpose: money moved between your own accounts is not a loss, whichever way it went. */}
            <Tile label="Net moved" value={`${flow.in - flow.out < 0 ? "−" : "+"}${formatRMWhole(Math.abs(flow.in - flow.out))}`} />
          </div>
        ) : (
          <div className="grid grid-cols-1">
            <Tile label="Moved between accounts" value={formatRMWhole(totals.transfer)} />
          </div>
        )
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          <Tile label="Income" value={formatRMWhole(totals.income)} tone="good" />
          <Tile label="Spent" value={formatRMWhole(totals.expense)} />
          <Tile label="Net" value={`${net < 0 ? "−" : "+"}${formatRMWhole(Math.abs(net))}`} tone={net < 0 ? "danger" : "good"} />
        </div>
      )}
      {accountChoice && flow && type !== "transfer" && (
        <p className="sub px-1">
          Transfers in this period: {formatRM(flow.out)} out, {formatRM(flow.in)} in. Income and spending above leave them out; a transfer shows on this account with a − (out) or + (in).
        </p>
      )}

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
                  <TransactionRow key={t.id} tx={t} viewing={viewing} />
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
