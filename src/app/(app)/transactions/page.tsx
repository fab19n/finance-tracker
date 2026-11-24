import { CheckSquare, Download, Plus, Search, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AccountChips } from "@/components/AccountChips";
import { BalanceHistory } from "@/components/account/BalanceHistory";
import { ActivitySearch } from "@/components/activity/ActivitySearch";
import { BulkBar } from "@/components/activity/BulkBar";
import { FilterSheet } from "@/components/activity/FilterSheet";
import { ScrollToHash } from "@/components/activity/ScrollToHash";
import { TransactionTable } from "@/components/activity/TransactionTable";
import { appliedCount, bareRM, typeText } from "@/components/activity/filter-logic";
import { MonthNav } from "@/components/MonthNav";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { PendingMark } from "@/components/PendingMark";
import { TransactionRow } from "@/components/TransactionRow";
import { balanceHistory } from "@/lib/analytics/ledger";
import { currentMonth, dayLabel, monthLabel, shortDate, todayISO } from "@/lib/dates";
import { formatRM, formatRMWholeBare, parseSen } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import { datePresets, parseTxSearch, qs, type SearchParams } from "@/lib/queries/filters";
import { FlowBar } from "@/components/FlowBar";
import { getAccountLedger } from "@/lib/queries/ledger";
import { getSettings } from "@/lib/settings";
import { listCategories } from "@/lib/queries/reference";
import { listTransactions, sumTransactions, sumTransferFlow, type TxRow } from "@/lib/queries/transactions";

export const metadata: Metadata = { title: "Activity" };

const PAGE_SIZE = 100;

/** A removable filter pill: a 44 px target, with a visible x and a spoken "Remove". */
const PILL = "pill min-h-11 bg-accent-soft px-3.5 text-accent-strong";

/** Drop empty values so the rest can be written into hidden form fields or a query string. */
const present = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ""));

/**
 * A totals tile on the list sheet (the design's `.tots`): a small upper-case label over the figure in the display face, on
 * the raised colour. Whole ringgit with no "RM" (the caption under the tiles says "amounts in RM" once). `gold` is the Net
 * tile, solid gold with dark text; its figure keeps its + or − sign, so the direction is never the colour alone.
 */
function Tile({ label, value, tone, gold = false }: { label: string; value: string; tone?: "good"; gold?: boolean }) {
  return (
    <div className={`min-w-0 rounded-2xl px-2.5 py-2 ${gold ? "bg-accent text-accent-fg" : "bg-card-subtle"}`}>
      <p className={`whitespace-nowrap text-[10.5px] font-extrabold uppercase tracking-[0.06em] ${gold ? "" : "text-muted"}`}>{label}</p>
      <p className={`num figure mt-0.5 whitespace-nowrap text-[19px] font-semibold leading-tight tracking-[-0.02em] ${tone === "good" ? "text-good" : ""}`}>{value}</p>
    </div>
  );
}

const SORT_TEXT: Record<string, string> = {
  oldest: "Oldest first",
  largest: "Largest amount first",
  smallest: "Smallest amount first",
};

/** "RM 100 - RM 500", "At least RM 100" or "At most RM 500" for the amount filter (null when there is none). */
function amountText(min: string, max: string): string | null {
  const [lo, hi] = [min ? parseSen(min) : null, max ? parseSen(max) : null];
  if (lo !== null && hi !== null) return lo === hi ? `Exactly ${formatRM(lo)}` : `${formatRM(lo)} - ${formatRM(hi)}`;
  if (lo !== null) return `At least ${formatRM(lo)}`;
  if (hi !== null) return `At most ${formatRM(hi)}`;
  return null;
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
  const sp = await searchParams;
  const view = parseTxSearch(sp);
  // Select mode (`?select=1`): rows get checkboxes and a sticky action bar; every other link on the page leaves it.
  const select = (Array.isArray(sp.select) ? sp.select[0] : sp.select) === "1";
  const viewing = view.filters.accountId ?? null;
  const today = todayISO();
  const [accounts, categories, rows, totals, flow, ledger, settings] = await Promise.all([
    getAccountBalances(true),
    listCategories(true),
    listTransactions({ ...view.filters, limit: PAGE_SIZE + 1, offset: (view.page - 1) * PAGE_SIZE }),
    sumTransactions(view.filters),
    // For one account: what left it and what arrived, by transfer, in the same period.
    viewing === null ? Promise.resolve(null) : sumTransferFlow(view.filters, viewing),
    // ...and everything its balance is made of, for the balance history.
    viewing === null ? Promise.resolve(null) : getAccountLedger(viewing),
    getSettings(),
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
    min: view.raw.min,
    max: view.raw.max,
    sort: view.raw.sort,
  };
  // This list as it is on screen (filters and page), so an entry opened from it can come back here.
  const listHref = `/transactions${qs({ ...base, page: view.page > 1 ? view.page : undefined })}`;
  const selectHref = (on: boolean) => `/transactions${qs({ ...base, page: view.page > 1 ? view.page : undefined, select: on ? "1" : undefined })}`;
  // Settings the Filter sheet edits itself; "Clear" in it removes exactly these.
  const sheetKeys = { type: undefined, category: undefined, from: undefined, to: undefined, min: undefined, max: undefined, sort: undefined, page: undefined };
  const amount = amountText(view.raw.min, view.raw.max);
  const sortText = SORT_TEXT[view.raw.sort] ?? null;
  const byAmount = view.raw.sort === "largest" || view.raw.sort === "smallest";
  const { q, category, account, type } = view.raw;
  const typeName = typeText(type);
  const applied = appliedCount({ type: Boolean(type), category: Boolean(category), range: Boolean(range), amount: Boolean(amount), sort: Boolean(sortText) });
  const presets = datePresets(today);
  // A date range from a link (the Dashboard's pay cycle) replaces the month navigator; otherwise a month, or all time.
  const monthNav = view.month !== "all" && !range;
  const categoryChoice = categories.find((c) => String(c.id) === category);
  const accountChoice = accounts.find((a) => String(a.id) === account);
  const filtered = Boolean(category || account || q.trim() || amount || range || type);
  const net = totals.income - totals.expense;
  const periodText = range ? rangeText(range) : monthNav ? monthLabel(view.month) : "All time";
  // The balance through the period on screen, never past today (the rest of this month hasn't happened). It ignores the list's
  // other filters on purpose: a balance is the whole account's.
  const history =
    accountChoice && ledger
      ? balanceHistory(ledger.opening, ledger.entries, accountChoice.id, {
          from: view.filters.from ?? null,
          to: view.filters.to && view.filters.to < today ? view.filters.to : today,
        })
      : null;
  const narrowed = Boolean(q.trim() || category || amount || type);
  // Every account, plus the chosen one even if it has since been archived.
  const chips = accounts
    .filter((a) => !a.archived || String(a.id) === account)
    .map((a) => ({ id: a.id, name: a.name, balance: a.balance, cardColor: a.cardColor, href: qs({ ...base, account: String(a.id), page: undefined }) }));

  // Nothing recorded anywhere (first run), as opposed to an empty month or a filter that matches nothing.
  const nothingAtAll = groups.length === 0 && !filtered ? (await sumTransactions({})).count === 0 : false;
  const signed = (n: number) => `${n < 0 ? "−" : "+"}${formatRMWholeBare(Math.abs(n))}`;
  const caption = [accountChoice?.name, periodText, `${totals.count} ${totals.count === 1 ? "entry" : "entries"}`, "amounts in RM"].filter(Boolean).join(" · ");

  return (
    <div className="space-y-3">
      <PageHeader
        title="Activity"
        actions={
          <>
            {!select && groups.length > 0 && (
              <Link href={selectHref(true)} className="btn min-h-11">
                <CheckSquare size={16} aria-hidden /> Select
                <PendingMark />
              </Link>
            )}
            <Link href={`/transactions/export${qs(base)}`} className="ib" prefetch={false} aria-label="Export CSV" title="Export CSV">
              <Download size={18} strokeWidth={2} aria-hidden />
            </Link>
          </>
        }
      />

      {/* Search and Filter in one row (the two ways to narrow the list): the search takes the room, Filter is a 100 px pill. */}
      <div className="grid grid-cols-[minmax(0,1fr)_100px] items-center gap-2 md:max-w-xl">
        <ActivitySearch q={q} others={present({ month: view.month, type, category, account, from: base.from, to: base.to, min: base.min, max: base.max, sort: base.sort })} />
        <FilterSheet
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          values={{ type, category, from: base.from, to: base.to, min: base.min, max: base.max, sort: base.sort }}
          presets={presets}
          others={present({ month: view.month, q: base.q, account })}
          clearHref={qs({ ...base, ...sheetKeys })}
          applied={applied}
        />
      </div>

      {/* Which account: one tap. Each shows its balance now (always the real balance, whatever period is on screen). */}
      <AccountChips label="Filter by account" accounts={chips} selectedId={accountChoice?.id ?? null} allHref={qs({ ...base, account: undefined, page: undefined })} />

      {monthNav ? (
        <MonthNav
          month={view.month}
          maxMonth={currentMonth()}
          path="/transactions"
          query={new URLSearchParams(present({ q: base.q, category, account, type, min: base.min, max: base.max, sort: base.sort })).toString()}
          sublabel={
            <Link href={qs({ ...base, month: "all" })} className="inline-flex min-h-11 items-center font-extrabold text-accent-strong hover:underline">
              Show all time
            </Link>
          }
          className="max-w-sm"
        />
      ) : range ? (
        // A date range (from the sheet or a pay-cycle link) is a gold chip you can remove: that brings the month back.
        <div className="flex flex-wrap items-center gap-2">
          <Link href={qs({ ...base, month: undefined, from: undefined, to: undefined, page: undefined })} className="chip on">
            {periodText} <X size={13} strokeWidth={3} aria-label="Remove date range, back to monthly" />
            <PendingMark />
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip on" aria-current="true">
            All time
          </span>
          <Link href={qs({ ...base, month: undefined, from: undefined, to: undefined, page: undefined })} className="chip">
            Back to monthly
            <PendingMark />
          </Link>
        </div>
      )}

      {(q.trim() || typeName || categoryChoice || amount || sortText) && (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Applied filters">
          {q.trim() && (
            <li>
              <Link href={qs({ ...base, q: undefined })} className={PILL}>
                Search: {q.trim()} <X size={12} aria-label="Remove" />
                <PendingMark />
              </Link>
            </li>
          )}
          {typeName && (
            <li>
              <Link href={qs({ ...base, type: undefined, page: undefined })} className={PILL}>
                {typeName} only <X size={12} aria-label="Remove" />
                <PendingMark />
              </Link>
            </li>
          )}
          {categoryChoice && (
            <li>
              <Link href={qs({ ...base, category: undefined })} className={PILL}>
                {categoryChoice.name} <X size={12} aria-label="Remove" />
                <PendingMark />
              </Link>
            </li>
          )}
          {amount && (
            <li>
              <Link href={qs({ ...base, min: undefined, max: undefined, page: undefined })} className={PILL}>
                {amount} <X size={12} aria-label="Remove" />
                <PendingMark />
              </Link>
            </li>
          )}
          {sortText && (
            <li>
              <Link href={qs({ ...base, sort: undefined, page: undefined })} className={PILL}>
                {sortText} <X size={12} aria-label="Remove" />
                <PendingMark />
              </Link>
            </li>
          )}
        </ul>
      )}

      {accountChoice && history && (
        <BalanceHistory
          name={accountChoice.name}
          history={history}
          period={periodText}
          statementHref={`/transactions/export${qs({ ...base, format: "statement" })}`}
          note={narrowed ? "This is the whole account's balance, not only the entries listed below." : undefined}
        />
      )}

      {groups.length === 0 && nothingAtAll ? (
        <EmptyState
          icon={<Plus size={28} strokeWidth={2} />}
          title="No entries yet"
          text="Add what you spend and earn, or bring in a bank statement. Everything you record shows up here."
          primary={{ label: "Add your first entry", href: "/" }}
          secondary={{ label: "Import a statement", href: "/import" }}
        />
      ) : (
        // The list sheet: totals and the day-by-day list on one paper-coloured surface with a 28 px rounded top (the
        // `paper-sheet` class re-points the colour tokens to paper in Dark; in Light it is simply the card colour).
        <div className="paper-sheet space-y-2 rounded-b-[20px] rounded-t-[28px] border border-line bg-card px-3.5 pb-2 pt-3.5 text-foreground md:p-5">
          {/* Only transfers on screen: income and spending would all read zero, so say what moved instead. */}
          {type === "transfer" ? (
            flow ? (
              <div className="grid grid-cols-3 gap-1.5">
                <Tile label="Moved out" value={formatRMWholeBare(flow.out)} />
                <Tile label="Moved in" value={formatRMWholeBare(flow.in)} tone="good" />
                {/* Neutral on purpose: money moved between your own accounts is not a loss, whichever way it went. */}
                <Tile label="Net moved" value={signed(flow.in - flow.out)} gold />
              </div>
            ) : (
              <div className="grid grid-cols-1">
                <Tile label="Moved between accounts" value={formatRMWholeBare(totals.transfer)} />
              </div>
            )
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              <Tile label="Money in" value={formatRMWholeBare(totals.income)} tone="good" />
              <Tile label="Money out" value={formatRMWholeBare(totals.expense)} />
              <Tile label="Net" value={signed(net)} gold />
            </div>
          )}
          <p className="sub text-right">{caption}</p>
          {type !== "transfer" && (
            <FlowBar
              income={totals.income}
              spent={totals.expense}
              expectedIncome={settings.expectedIncome}
              narrowed={Boolean(account || category || q.trim() || amount || type)}
              flat
            />
          )}
          {accountChoice && flow && type !== "transfer" && (
            <p className="sub">
              Transfers in this period: {formatRM(flow.out)} out, {formatRM(flow.in)} in. Income and spending above leave them out; a transfer shows on this account with a − (out) or + (in).
            </p>
          )}

          {groups.length === 0 ? (
            <EmptyState
              className="!border-0 !bg-transparent !px-2"
              icon={<Search size={28} strokeWidth={2} />}
              title="No entries match"
              text={
                q.trim()
                  ? `Nothing in ${periodText} matches "${q.trim()}"${category || amount || type || account ? " with the other filters" : ""}. Try another word, or clear the search.`
                  : filtered
                    ? `Nothing in ${periodText} fits these filters. Try clearing them or looking at all time.`
                    : `Nothing has been recorded for ${periodText} yet.`
              }
              primary={q.trim() ? { label: "Clear search", href: qs({ ...base, q: undefined, page: undefined }) } : filtered ? { label: "Clear filters", href: qs({ month: view.month }) } : undefined}
              secondary={!monthNav ? { label: "Back to monthly", href: qs({ ...base, month: undefined, from: undefined, to: undefined, page: undefined }) } : q.trim() && filtered && (category || amount || type || account) ? { label: "Clear all filters", href: qs({ month: view.month }) } : undefined}
            />
          ) : (
            <>
          {/* Phone: the day-by-day rows. From md up the same entries are the table below. */}
          <div className="space-y-2 md:hidden">
          {byAmount ? (
            // Ordered by amount, the days are all mixed up, so no day headings: one list, each row says its date.
            <section data-dim-on-pending>
              <h2 className="pb-1 pt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{sortText}</h2>
              <ul>
                {pageRows.map((t) => (
                  <TransactionRow key={t.id} tx={t} showDate viewing={viewing} backHref={listHref} select={select} />
                ))}
              </ul>
            </section>
          ) : (
            groups.map((g) => {
              const spent = g.items.filter((i) => i.type === "expense").reduce((s, i) => s + i.amount, 0);
              return (
                <section key={g.date} data-dim-on-pending>
                  <div className="flex items-baseline justify-between gap-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                    <h2 className="font-bold">{dayLabel(g.date)}</h2>
                    {spent > 0 && <span className="num">Spent RM {bareRM(formatRM(spent))}</span>}
                  </div>
                  <ul>
                    {g.items.map((t) => (
                      <TransactionRow key={t.id} tx={t} viewing={viewing} backHref={listHref} select={select} />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
          </div>
          <TransactionTable rows={pageRows} viewing={viewing} backHref={listHref} sort={view.raw.sort} select={select} hrefFor={(next) => `/transactions${qs({ ...base, sort: next, page: undefined, select: select ? "1" : undefined })}`} />
            </>
          )}
        </div>
      )}

      {select && groups.length > 0 && <BulkBar categories={categories.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name, type: c.type }))} doneHref={selectHref(false)} />}
      <ScrollToHash />

      {(view.page > 1 || hasNext) && (
        <div className="flex items-center justify-between">
          {view.page > 1 ? (
            <Link href={qs({ ...base, page: view.page - 1, select: select ? "1" : undefined })} className="btn">
              <PendingMark />
              {sortText ? "‹ Previous" : "‹ Newer"}
            </Link>
          ) : (
            <span />
          )}
          {hasNext && (
            <Link href={qs({ ...base, page: view.page + 1, select: select ? "1" : undefined })} className="btn">
              {sortText ? "Next ›" : "Older ›"}
              <PendingMark />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
