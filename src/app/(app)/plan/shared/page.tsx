import { ChevronDown, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Kpi } from "@/components/Kpi";
import { SavedNotice } from "@/components/settings/SavedNotice";
import { PlanHeader } from "@/components/plan/PlanHeader";
import { ShareForm } from "@/components/plan/ShareForm";
import { SharedBillCard } from "@/components/plan/SharedBillCard";
import { UNCLAIMED_SHOWN, UnassignedPayments } from "@/components/plan/UnassignedPayments";
import { shortMonthLabel, todayISO } from "@/lib/dates";
import { initials } from "@/lib/initials";
import { formatRM } from "@/lib/money";
import { owedMonthsText } from "@/lib/plan/shares-text";
import type { SearchParams } from "@/lib/queries/filters";
import { listBills } from "@/lib/queries/plan";
import { getSharedBills } from "@/lib/queries/shares";

export const metadata: Metadata = { title: "Shared bills" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SharedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const error = first(sp.error);
  const linked = Number(first(sp.linked)) || 0;
  const today = todayISO();
  const [page, bills] = await Promise.all([getSharedBills(today), listBills()]);

  const splitOf = new Map(page.bills.map((v) => [v.bill.id, v.bill.sharing]));
  const billOptions = bills.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name, sharing: splitOf.get(b.id) ?? ("monthly" as const) }));
  // A new person starts this month. (Starting in January made everyone owe for months before they joined; set an earlier month by hand when they did.)
  const defaultStart = today.slice(0, 7);

  // Everyone who owes you something, biggest first: the people to chase. (Equal monthly parts, or a turn that has come round.)
  const owing = page.bills
    .flatMap((b) => [
      ...b.people.map((p) => ({ key: `m${p.share.id}`, bill: b.bill.name, name: p.share.name, amount: p.owedNow, detail: owedMonthsText(p) })),
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
    <div className="max-w-3xl space-y-3 md:space-y-4">
      <PlanHeader />

      <div className="px-1">
        <h2 className="h2">Shared subscriptions</h2>
        <details className="group">
          <summary className="mt-0.5 inline-flex cursor-pointer list-none items-center gap-1 py-1.5 text-xs font-extrabold text-accent-strong md:text-[13px] [&::-webkit-details-marker]:hidden">
            How shared bills work
            <ChevronDown size={14} strokeWidth={2.5} className="transition group-open:rotate-180" aria-hidden />
          </summary>
          <p className="sub leading-relaxed">
            A bill can be split two ways. <strong className="text-foreground">Equal parts</strong> (Netflix): each person owes their share of every month, worked out from what the bill was charged that month, so a price rise counts only from the
            month it took effect. Whatever they send pays whole months at the price it was sent at, oldest first, so a lump sum for three months and a single month both work, and a month that now costs more than they paid shows what is still to pay. <strong className="text-foreground">In turns</strong> (Spotify): one person pays the whole month, you take the first month of each cycle, and a payment settles that person&apos;s own month.
            Set up who shares what, and this shows who has paid for which month.
          </p>
        </details>
      </div>

      {error && (
        <p role="alert" className="banner banner-danger">
          {error}
        </p>
      )}
      <SavedNotice saved={sp.saved} />
      {linked > 0 && (
        <p role="status" className="banner banner-good">
          Counted {linked} payment{linked === 1 ? "" : "s"} you had already received from them.
        </p>
      )}

      {page.bills.length > 0 && (
        <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3" aria-label="Totals">
          {/* The headline of this page is what people owe you: the coin-rim hero, with the people count as its hint. */}
          <div className="hero col-span-2 md:col-span-3">
            <p className="mb-1.5 text-xs font-extrabold">Owed to you</p>
            <p className="num text-[44px] font-black leading-[0.95] tracking-[-0.03em]">{formatRM(page.owedToYou)}</p>
            <p className="mt-3 text-xs font-extrabold">{owing.length ? `${owing.length} ${owing.length === 1 ? "person" : "people"} still owe you` : "everyone is paid up"}</p>
          </div>
          <Kpi label="Shared bills" value={String(page.bills.length)} hint={`${page.people.filter((p) => p.active).length} people sharing`} />
          <Kpi
            label="Unclaimed money in"
            value={String(page.unassigned.length)}
            hint={page.unassigned.length > UNCLAIMED_SHOWN ? `entries not counted; the ${UNCLAIMED_SHOWN} newest are listed below` : "entries not counted towards anyone"}
          />
        </section>
      )}

      {owing.length > 0 && (
        <section className="card space-y-3" aria-labelledby="owing-h">
          <h2 id="owing-h" className="h2">
            Who owes you
          </h2>
          <ul className="space-y-1.5">
            {owing.map((o) => (
              <li key={o.key} className="flex items-center gap-2.5 rounded-2xl bg-card-subtle px-3 py-2.5">
                <span className="grid size-[34px] shrink-0 place-items-center rounded-xl bg-card text-xs font-black" aria-hidden>
                  {initials(o.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-extrabold">{o.name}</p>
                  <p className="truncate text-[11px] font-bold text-muted">{o.bill}</p>
                </div>
                <div className="max-w-[55%] shrink-0 text-right">
                  <p className="num text-[13px] font-black text-warn">{formatRM(o.amount)}</p>
                  <p className="break-words text-[11px] font-bold text-muted">{o.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {page.bills.map((view) => (
        <SharedBillCard key={view.bill.id} view={view} people={page.people} bills={billOptions} defaultStart={defaultStart} today={today} />
      ))}

      <UnassignedPayments credits={page.unassigned} people={page.people} />

      <details className="card group" open={page.bills.length === 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="h2">Add someone to a shared bill</span>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-card-subtle text-muted" aria-hidden>
            <Plus size={14} strokeWidth={3} className="transition group-open:rotate-45" />
          </span>
        </summary>
        <div className="mt-4 space-y-3">
          {page.bills.length === 0 && (
            <p className="sub leading-relaxed">
              Start with the bill (it needs to be in your <Link href="/plan/bills" className="font-extrabold text-accent-strong">bills</Link> first), the person, and what they owe you each month today, for example a quarter of a Netflix bill. (Earlier months are worked out from what the bill was charged then. A bill paid in turns needs no amount: choose how it is split on its card after adding the first person.)
              Putting the words that appear on your bank statement when they pay you (a surname will do) lets the app count their payments by itself, including ones you have already received.
            </p>
          )}
          <ShareForm bills={billOptions} defaultStart={defaultStart} />
        </div>
      </details>
    </div>
  );
}
