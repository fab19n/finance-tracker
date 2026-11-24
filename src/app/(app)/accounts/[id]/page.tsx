import { ArrowRight, Settings2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountCard } from "@/components/account/AccountCard";
import { PageHeader } from "@/components/PageHeader";
import { withBack } from "@/lib/back";
import { shortDate } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import { listTransactions, type TxRow } from "@/lib/queries/transactions";
import { CAP, FIRST, movementsShown, STEP } from "@/lib/movements";
import { transferView } from "@/lib/transfer-view";


function Movement({ tx, viewing, back }: { tx: TxRow; viewing: number; back: string }) {
  const t = tx.type === "transfer" ? transferView(tx, viewing) : null;
  const title = t ? tx.item || t.title : tx.item || tx.categoryName || "Entry";
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "−" : t?.sign === "+" ? "+" : "−";
  const money = sign === "+";
  return (
    <li className="relative pb-4 pl-6 last:pb-0">
      {/* The line runs through every dot: each movement is joined to the next one. */}
      <span aria-hidden className={`absolute left-[-6px] top-1.5 size-[10px] rounded-full ring-4 ring-card ${money ? "bg-good" : "bg-foreground"}`} />
      <Link href={withBack(`/transactions/${tx.id}`, back)} className="-my-1 flex items-center gap-3 rounded-xl py-1 transition hover:bg-card-subtle">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-extrabold">{title}</span>
          <span className="sub block truncate">{[shortDate(tx.date), tx.type === "transfer" ? null : tx.categoryName].filter(Boolean).join(" · ")}</span>
        </span>
        <span className={`num shrink-0 text-[13px] font-extrabold ${money ? "text-good" : ""}`}>
          {sign}
          {formatRM(tx.amount)}
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
  // An entry opened from here comes back here, to the same stretch of the list.
  const here = `/accounts/${id}${show > FIRST ? `?show=${show}` : ""}`;

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title={account.name} subtitle={account.archived ? "Archived account" : undefined} back={{ href: "/accounts", label: "Back to Accounts" }} />
      <AccountCard account={account} />
      <Link href={`/accounts/${id}/card`} className="btn w-full">
        <Settings2 size={16} strokeWidth={2.4} aria-hidden /> Card settings
      </Link>

      <section className="card" aria-labelledby="movements-h">
        <h2 id="movements-h" className="h2 mb-3">
          Movements
        </h2>
        {movements.length === 0 ? (
          <p className="sub">Nothing has moved in this account yet.</p>
        ) : (
          <ol className="ml-1.5 border-l-2 border-line">
            {movements.map((tx) => (
              <Movement key={tx.id} tx={tx} viewing={id} back={here} />
            ))}
          </ol>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {more && show < CAP && (
            <Link href={`/accounts/${id}?show=${show + STEP}`} scroll={false} className="btn">
              View more
            </Link>
          )}
          <Link href={`/transactions?account=${id}`} className="btn">
            All entries and filters <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
