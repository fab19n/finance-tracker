import { ChevronDown, Plus } from "lucide-react";
import { connection } from "next/server";
import { BillForm } from "@/components/plan/BillForm";
import { PlanHeader } from "@/components/plan/PlanHeader";
import { Kpi } from "@/components/Kpi";
import { initials } from "@/lib/initials";
import { formatPct, formatRM, formatRMWhole } from "@/lib/money";
import { monthlyCommitments } from "@/lib/plan/bills";
import type { SearchParams } from "@/lib/queries/filters";
import { listBills, listSalaries } from "@/lib/queries/plan";
import { listAccounts, listCategories } from "@/lib/queries/reference";
import { getSettings } from "@/lib/settings";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const range = (min: number, max: number) => (min === max ? formatRM(min) : `${formatRM(min)} - ${formatRM(max)}`);

export default async function BillsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const error = first((await searchParams).error);
  const [bills, categories, accounts, salaries, settings] = await Promise.all([listBills(), listCategories(), listAccounts(), listSalaries(), getSettings()]);
  const c = monthlyCommitments(bills);
  const income = salaries[salaries.length - 1]?.amount || settings.expectedIncome;

  const expenseCategories = categories.filter((x) => x.type === "expense").map((x) => ({ id: x.id, name: x.name, icon: x.icon }));
  const payingAccounts = accounts.filter((a) => a.type !== "investment").map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="max-w-3xl space-y-3 md:space-y-4">
      <PlanHeader />

      <div className="px-1">
        <h2 className="h2">Bills &amp; subscriptions</h2>
        <p className="sub mt-0.5 leading-relaxed">
          Everything that leaves your account every month. For a bill that varies (rent 950-980, electricity), give the lowest amount and the &quot;up to&quot; amount.
        </p>
      </div>

      {error && (
        <p role="alert" className="banner banner-danger">
          {error}
        </p>
      )}

      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3" aria-label="Totals">
        <Kpi label="Per month" value={formatRMWhole(c.monthly)} hint={`${c.count} bills`} />
        <Kpi label="Per year" value={formatRMWhole(c.annual)} hint="what these cost over 12 months" />
        <Kpi label="Subscriptions & wants" value={formatRMWhole(c.discretionaryMonthly)} hint={`${formatRMWhole(c.discretionaryAnnual)} a year`} />
        <Kpi label="Share of your pay" value={income > 0 ? formatPct(c.monthly / income) : "-"} hint={income > 0 ? `of ${formatRMWhole(income)}` : "set your pay in Settings"} />
      </section>

      <details className="card group" open={bills.length === 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="h2">Add a bill</span>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-card-subtle text-muted" aria-hidden>
            <Plus size={14} strokeWidth={3} className="transition group-open:rotate-45" />
          </span>
        </summary>
        <div className="mt-4">
          <BillForm categories={expenseCategories} accounts={payingAccounts} />
        </div>
      </details>

      {bills.length === 0 ? (
        <p className="card sub">No bills yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {bills.map((b) => (
            <li key={b.id} className={`rounded-2xl bg-card px-3.5 py-3 ${b.active ? "" : "opacity-60"}`}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
                  <span className="grid size-[34px] shrink-0 place-items-center rounded-xl bg-card-subtle text-xs font-black" aria-hidden>
                    {initials(b.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-extrabold">{b.name}</span>
                      {!b.active && <span className="pill bg-warn-soft text-warn">paused</span>}
                      {b.nature === "want" && <span className="pill bg-card-subtle text-muted">want</span>}
                    </span>
                    <span className="block text-[11px] font-bold text-muted">{b.dueDay ? `due ${b.dueDay}` : "no due day"}</span>
                  </span>
                  <span className="num shrink-0 text-[13px] font-black">{range(b.amountMin, b.amountMax)}</span>
                  <ChevronDown size={16} strokeWidth={2.5} className="shrink-0 text-muted transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="mt-3">
                  <BillForm bill={b} categories={expenseCategories} accounts={payingAccounts} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
