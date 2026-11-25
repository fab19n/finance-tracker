import { ArrowRightLeft, ChevronRight, Download, SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountCard } from "@/components/account/AccountCard";
import { UpdateBalance } from "@/components/account/UpdateBalance";
import { DuoIcon } from "@/components/DuoIcon";
import { categoryIconName } from "@/components/entry/entry-logic";
import { PageHeader } from "@/components/PageHeader";
import { withBack } from "@/lib/back";
import { shortDate, todayISO } from "@/lib/dates";
import { initials } from "@/lib/initials";
import { formatRM } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import { getAccountLedger } from "@/lib/queries/ledger";
import { listTransactions, type TxRow } from "@/lib/queries/transactions";
import { balanceAfterById, CAP, FIRST, movementsShown, STEP } from "@/lib/movements";
import { transferView } from "@/lib/transfer-view";

export const metadata: Metadata = { title: "Account" };

/** One movement on the timeline: a round icon node on the line, what it was, the signed amount and the balance after it. */
function Movement({ tx, viewing, back, balance }: { tx: TxRow; viewing: number; back: string; balance: number | undefined }) {
  const t = tx.type === "transfer" ? transferView(tx, viewing) : null;
  const title = t ? tx.item || t.title : tx.item || tx.categoryName || "Entry";
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "−" : t?.sign === "+" ? "+" : "−";
  const money = sign === "+";
  const icon = tx.type === "transfer" ? null : categoryIconName(tx.categoryName ?? "");
  return (
    <li>
      <Link
        href={withBack(`/transactions/${tx.id}`, back)}
        className="grid min-h-14 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl py-2 transition hover:bg-card-subtle"
      >
        {/* The node sits ON the line: a ring in the card's colour cuts the line around it. Money in is tinted good. */}
        <span aria-hidden className={`relative z-[1] grid size-10 place-items-center rounded-full ring-[5px] ring-card ${money ? "bg-good-soft text-good" : "bg-card-subtle text-foreground"}`}>
          {tx.type === "transfer" ? <ArrowRightLeft size={18} strokeWidth={2} /> : icon ? <DuoIcon name={icon} size={20} /> : <span className="text-[11px] font-extrabold">{initials(tx.categoryName)}</span>}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-bold">{title}</span>
          <span className="sub block truncate">{[shortDate(tx.date), tx.type === "transfer" ? "Transfer" : tx.categoryName].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="num text-right">
          <span className={`block text-[13px] font-bold ${money ? "text-good" : ""}`}>
            {sign}
            {formatRM(tx.amount)}
          </span>
          {balance !== undefined && (
            <span className="sub block">
              <span className="sr-only">Balance after: </span>
              {formatRM(balance)}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string }> }) {
  const id = Number((await params).id);
  const show = movementsShown((await searchParams).show);
  const account = Number.isInteger(id) ? (await getAccountBalances(true)).find((a) => a.id === id) : undefined;
  if (!account) notFound();
  // One extra row says whether there is more to show.
  const rows = await listTransactions({ accountId: id, limit: show + 1 });
  const movements = rows.slice(0, show);
  const more = rows.length > show;
  // The running balance after each line, from the same ledger as the balance chart and the statement.
  const ledger = await getAccountLedger(id);
  const after = balanceAfterById(ledger.opening, ledger.entries, id);
  // An entry opened from here comes back here, to the same stretch of the list.
  const here = `/accounts/${id}${show > FIRST ? `?show=${show}` : ""}`;

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title={account.name} subtitle={account.archived ? "Archived account" : undefined} back={{ href: "/accounts", label: "Back to Accounts" }} />
      <AccountCard account={account} size="lg" />
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/accounts/${id}/card`} className="btn">
          <SlidersHorizontal size={16} strokeWidth={2.2} aria-hidden /> Card settings
        </Link>
        {/* The whole history of this one account, as a CSV with the balance after every line (month=all). */}
        <Link href={`/transactions/export?account=${id}&format=statement&month=all`} prefetch={false} className="btn">
          <Download size={16} strokeWidth={2.2} aria-hidden /> Statement
          <span className="sr-only">(CSV, whole history)</span>
        </Link>
      </div>
      {/* Cash has "count your cash" (Insights) and an investment its valuations: this is for accounts that pay interest. */}
      {!account.archived && (account.type === "bank" || account.type === "ewallet") && <UpdateBalance key={id} accountId={id} today={todayISO()} />}
      {/* Name, opening balance, archiving and the account's role are edited in Settings. */}
      <p className="sub -mt-2 text-center">
        <Link href="/settings?tab=accounts" className="inline-flex min-h-11 items-center font-extrabold text-accent-strong underline-offset-2 hover:underline">
          Edit account
        </Link>{" "}
        to rename it or change its opening balance.
      </p>

      <div className="flex items-baseline justify-between px-0.5">
        <h2 id="movements-h" className="label !mb-0 uppercase tracking-[0.1em]">
          Recent movements
        </h2>
        <span className="sub" aria-hidden>
          Balance after
        </span>
      </div>
      <section className="card !py-2" aria-labelledby="movements-h">
        {movements.length === 0 ? (
          <p className="sub py-3">Nothing has moved in this account yet.</p>
        ) : (
          // One line runs behind every node (from the first node's middle to the last): each movement is joined to the next.
          <ol className="relative before:absolute before:bottom-8 before:left-[19px] before:top-8 before:w-0.5 before:rounded-full before:bg-muted/40">
            {movements.map((tx) => (
              <Movement key={tx.id} tx={tx} viewing={id} back={here} balance={after.get(tx.id)} />
            ))}
          </ol>
        )}
      </section>
      <div className="grid gap-2">
        {more && show < CAP && (
          <Link href={`/accounts/${id}?show=${show + STEP}`} scroll={false} className="btn w-full">
            <ChevronRight size={16} strokeWidth={2.2} aria-hidden /> View more
          </Link>
        )}
        <Link href={`/transactions?account=${id}`} className="btn w-full">
          All entries and filters
        </Link>
      </div>
    </div>
  );
}
