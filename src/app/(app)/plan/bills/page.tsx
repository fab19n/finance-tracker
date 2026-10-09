import Link from "next/link";
import { connection } from "next/server";
import { BillForm } from "@/components/plan/BillForm";
import { Kpi } from "@/components/Kpi";
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/plan" className="text-sm font-medium text-accent">
          ← Plan
        </Link>
        <h1 className="h-page">Bills &amp; subscriptions</h1>
        <p className="text-sm text-muted">
          Everything that leaves your account every month. For a bill that varies (rent 950-980, electricity), give the lowest amount and the &quot;up to&quot; amount.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Totals">
        <Kpi label="Per month" value={formatRMWhole(c.monthly)} hint={`${c.count} bills`} />
        <Kpi label="Per year" value={formatRMWhole(c.annual)} hint="what these cost over 12 months" />
        <Kpi label="Subscriptions & wants" value={formatRMWhole(c.discretionaryMonthly)} hint={`${formatRMWhole(c.discretionaryAnnual)} a year`} />
        <Kpi label="Share of your pay" value={income > 0 ? formatPct(c.monthly / income) : "-"} hint={income > 0 ? `of ${formatRMWhole(income)}` : "set your pay in Settings"} />
      </section>

      <details className="card" open={bills.length === 0}>
        <summary className="cursor-pointer font-semibold">Add a bill</summary>
        <div className="mt-4">
          <BillForm categories={expenseCategories} accounts={payingAccounts} />
        </div>
      </details>

      {bills.length === 0 ? (
        <p className="card text-sm text-muted">No bills yet.</p>
      ) : (
        <ul className="space-y-2">
          {bills.map((b) => (
            <li key={b.id} className={`card !p-3 ${b.active ? "" : "opacity-60"}`}>
              <details>
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">
                    <span aria-hidden>{b.categoryIcon ?? "•"}</span> {b.name}
                    {!b.active && <span className="pill ml-1.5 bg-warn-soft text-warn">paused</span>}
                    {b.nature === "want" && <span className="pill ml-1.5 bg-background text-muted">want</span>}
                  </span>
                  <span className="num shrink-0 text-sm">
                    <span className="font-semibold">{range(b.amountMin, b.amountMax)}</span>
                    <span className="ml-2 text-xs text-muted">{b.dueDay ? `due ${b.dueDay}` : "no due day"}</span>
                  </span>
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
