import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AccountChips } from "@/components/AccountChips";
import { DuoIcon } from "@/components/DuoIcon";
import { Kpi } from "@/components/Kpi";
import { BillForm } from "@/components/plan/BillForm";
import { BillRow } from "@/components/plan/BillRow";
import { PlanHeader } from "@/components/plan/PlanHeader";
import { SavedNotice } from "@/components/settings/SavedNotice";
import { shortDate, todayISO } from "@/lib/dates";
import { formatPct, formatRMWhole } from "@/lib/money";
import { monthlyCommitments } from "@/lib/plan/bills";
import { billCaption, billTiles } from "@/lib/plan/bills-view";
import { cycleLabel } from "@/lib/plan/cycle";
import { getAccountBalances } from "@/lib/queries/accounts";
import { getBillUsage } from "@/lib/queries/bill-usage";
import { qs, type SearchParams } from "@/lib/queries/filters";
import { getPlan, listBills, listSalaries } from "@/lib/queries/plan";
import { listCategories } from "@/lib/queries/reference";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Bills" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BillsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const error = first(sp.error);
  const today = todayISO();
  const [allBills, categories, accounts, salaries, settings, usage, plan] = await Promise.all([
    listBills(),
    listCategories(),
    getAccountBalances(),
    listSalaries(),
    getSettings(),
    getBillUsage(),
    getPlan(today),
  ]);

  // One account on its own (?account=): only the bills paid from it. (An investment account pays none, so it isn't offered.)
  const payingAccounts = accounts.filter((a) => a.type !== "investment");
  const accountId = Number(first(sp.account)) || null;
  // "Add as bill" on Insights opens this page with the payment's name and amount: start the new bill from them.
  const prefillName = (first(sp.name) ?? "").trim().slice(0, 80);
  const prefillAmount = /^\d+(\.\d{1,2})?$/.test(first(sp.amount) ?? "") ? (first(sp.amount) as string) : "";
  const prefill = prefillName ? { name: prefillName, amount: prefillAmount } : undefined;
  const accountChoice = payingAccounts.find((a) => a.id === accountId) ?? null;
  const bills = accountChoice ? allBills.filter((b) => b.accountId === accountChoice.id) : allBills;
  const c = monthlyCommitments(bills);
  const income = salaries[salaries.length - 1]?.amount || settings.expectedIncome;

  // This pay cycle's state of each active bill (the same evaluation the Overview and the hero use), so the tiles, the tags
  // and "Mark paid" agree with the rest of the Plan.
  const cycleItems = plan.bills.filter((i) => !accountChoice || i.bill.accountId === accountChoice.id);
  const inCycle = new Map(cycleItems.map((i) => [i.bill.id, i]));
  const tiles = billTiles(cycleItems, today);

  const expenseCategories = categories.filter((x) => x.type === "expense").map((x) => ({ id: x.id, name: x.name, icon: x.icon }));
  const accountOptions = payingAccounts.map((a) => ({ id: a.id, name: a.name }));
  const chips = payingAccounts.map((a) => ({ id: a.id, name: a.name, balance: a.balance, href: `/plan/bills${qs({ account: a.id })}` }));

  // "Add a bill" is the board's full-width button under the list; a bill sent from Insights, or an empty list, opens it.
  const addBill = (
    <details className="group" open={allBills.length === 0 || !!prefill}>
      <summary className="btn w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <DuoIcon name="plus" size={18} aria-hidden /> Add a bill
      </summary>
      <div className="card mt-2.5 space-y-3">
        <p className="sub leading-relaxed">
          Everything that leaves your account every month. For a bill that varies (rent 950-980, electricity), give the lowest amount and the &quot;up to&quot; amount.
        </p>
        <BillForm categories={expenseCategories} accounts={accountOptions} defaultAccountId={accountChoice?.id} returnAccount={accountChoice?.id} prefill={prefill} />
      </div>
    </details>
  );

  return (
    <div className="max-w-3xl space-y-3 md:space-y-4">
      <PlanHeader account={accountChoice?.id} />

      <AccountChips label="Show bills for one account" accounts={chips} selectedId={accountChoice?.id ?? null} allHref="/plan/bills" />

      {error && (
        <p role="alert" className="banner banner-danger">
          {error}
        </p>
      )}
      <SavedNotice saved={sp.saved} />

      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3" aria-label={`Bills for the pay cycle ${cycleLabel(plan.cycle)}`}>
        <Kpi label="This month" value={formatRMWhole(tiles.month)} hint={`${tiles.count} bill${tiles.count === 1 ? "" : "s"} this cycle`} />
        <Kpi label="Paid" value={formatRMWhole(tiles.paid)} tone="good" hint={`${tiles.paidCount} of ${tiles.count}`} />
        <Kpi
          label="Still to pay"
          value={formatRMWhole(tiles.remaining)}
          hint={tiles.overdueCount > 0 ? `${tiles.overdueCount} overdue` : `${tiles.count - tiles.paidCount} to go`}
        />
        <Kpi
          label="Next due"
          value={tiles.next ? shortDate(tiles.next.date) : "-"}
          hint={tiles.next ? `${tiles.next.name}${tiles.next.overdue ? " (overdue)" : ""}` : "nothing left to pay"}
        />
      </section>
      <p className="sub px-1 leading-relaxed">
        Pay cycle {cycleLabel(plan.cycle)}.
        {c.count > 0 && (
          <>
            {" "}
            At their usual amounts the {c.count} bill{c.count === 1 ? "" : "s"} come to {formatRMWhole(c.monthly)} a month ({formatRMWhole(c.annual)} a year
            {income > 0 ? `, ${formatPct(c.monthly / income)} of your pay` : ""}), of which subscriptions and other wants are {formatRMWhole(c.discretionaryMonthly)} a month.
          </>
        )}
      </p>

      {prefill && addBill}

      <section aria-labelledby="bills-list-h" className="space-y-2">
        <h2 id="bills-list-h" className="label px-1">
          Bills{accountChoice && ` · paid from ${accountChoice.name}`}
        </h2>
        {bills.length === 0 ? (
          <p className="card sub">
            {accountChoice ? (
              <>
                No bills are paid from {accountChoice.name}.{" "}
                <Link href="/plan/bills" className="font-extrabold text-accent-strong hover:underline">
                  Show every bill
                </Link>
              </>
            ) : (
              "No bills yet."
            )}
          </p>
        ) : (
          <ul className="rows">
            {bills.map((b) => (
              <BillRow
                key={b.id}
                bill={b}
                categoryName={b.categoryName}
                item={inCycle.get(b.id) ?? null}
                today={today}
                account={accountChoice?.id}
                caption={billCaption(b, { account: accountChoice ? null : b.accountName, dueDate: inCycle.get(b.id)?.dueDate ?? null, people: usage.get(b.id)?.people })}
                editForm={<BillForm bill={b} usage={usage.get(b.id)} returnAccount={accountChoice?.id} categories={expenseCategories} accounts={accountOptions} />}
              />
            ))}
          </ul>
        )}
      </section>

      {!prefill && addBill}
    </div>
  );
}
