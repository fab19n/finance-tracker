import Link from "next/link";
import { connection } from "next/server";
import { Kpi } from "@/components/Kpi";
import { ShareForm } from "@/components/plan/ShareForm";
import { SharedBillCard } from "@/components/plan/SharedBillCard";
import { UnassignedPayments } from "@/components/plan/UnassignedPayments";
import { shortMonthLabel, todayISO } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import type { SearchParams } from "@/lib/queries/filters";
import { listBills } from "@/lib/queries/plan";
import { getSharedBills } from "@/lib/queries/shares";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SharedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const error = first(sp.error);
  const linked = Number(first(sp.linked)) || 0;
  const today = todayISO();
  const [page, bills] = await Promise.all([getSharedBills(today), listBills()]);

  const billOptions = bills.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name }));
  // Most people start a plan "at the start of this year"; they can change it.
  const defaultStart = `${today.slice(0, 4)}-01`;

  // Everyone who owes you something, biggest first: the people to chase. (Equal monthly parts, or a turn that has come round.)
  const owing = page.bills
    .flatMap((b) => [
      ...b.people.map((p) => ({ key: `m${p.share.id}`, bill: b.bill.name, name: p.share.name, amount: p.balance, detail: `${p.monthsOwed} month${p.monthsOwed === 1 ? "" : "s"}` })),
      ...(b.rotation?.people ?? []).map((p) => ({
        key: `t${p.share.id}`,
        bill: b.bill.name,
        name: p.share.name,
        amount: p.owes,
        detail: p.turns.filter((c) => c.month <= today.slice(0, 7) && c.state !== "paid").map((c) => shortMonthLabel(c.month)).join(", "),
      })),
    ])
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/plan" className="text-sm font-medium text-accent">
          ← Plan
        </Link>
        <h1 className="h-page">Shared subscriptions</h1>
        <p className="text-sm text-muted">
          A bill can be split two ways. <strong>Equal parts</strong> (Netflix): each person owes their share of every month, and whatever they send pays their oldest unpaid month first, so a lump sum for three
          months and a single month both work. <strong>In turns</strong> (Spotify): one person pays the whole month, you take the first month of each cycle, and a payment settles that person&apos;s own month.
          Set up who shares what, and this shows who has paid for which month.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {linked > 0 && (
        <p role="status" className="rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
          Counted {linked} payment{linked === 1 ? "" : "s"} you had already received from them.
        </p>
      )}

      {page.bills.length > 0 && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label="Totals">
          <Kpi label="Owed to you" value={formatRM(page.owedToYou)} hint={owing.length ? `${owing.length} ${owing.length === 1 ? "person" : "people"}` : "everyone is paid up"} />
          <Kpi label="Shared bills" value={String(page.bills.length)} hint={`${page.people.filter((p) => p.active).length} people sharing`} />
          <Kpi label="Unclaimed money in" value={String(page.unassigned.length)} hint="entries not counted towards anyone" />
        </section>
      )}

      {owing.length > 0 && (
        <section className="card" aria-labelledby="owing-h">
          <h2 id="owing-h" className="font-semibold">
            Who owes you
          </h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {owing.map((o) => (
              <li key={o.key} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span>
                  <span className="font-medium">{o.name}</span> <span className="text-muted">· {o.bill}</span>
                </span>
                <span className="num font-semibold text-warn">
                  {formatRM(o.amount)} <span className="font-normal text-muted">({o.detail})</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {page.bills.map((view) => (
        <SharedBillCard key={view.bill.id} view={view} people={page.people} bills={billOptions} defaultStart={defaultStart} today={today} />
      ))}

      <UnassignedPayments credits={page.unassigned} people={page.people} />

      <details className="card" open={page.bills.length === 0}>
        <summary className="cursor-pointer font-semibold">Add someone to a shared bill</summary>
        <div className="mt-4 space-y-2">
          {page.bills.length === 0 && (
            <p className="text-sm text-muted">
              Start with the bill (it needs to be in your <Link href="/plan/bills" className="font-medium text-accent">bills</Link> first), the person, and what they owe you each month: RM 22.25 for a Netflix quarter, RM 5.15 for a Spotify sixth.
              Putting the words that appear on your bank statement when they pay you (a surname will do) lets the app count their payments by itself, including ones you have already received.
            </p>
          )}
          <ShareForm bills={billOptions} defaultStart={defaultStart} />
        </div>
      </details>
    </div>
  );
}
