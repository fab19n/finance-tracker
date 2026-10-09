import Link from "next/link";
import { connection } from "next/server";
import { ImportWizard } from "@/components/import/ImportWizard";
import { selectBills } from "@/lib/queries/plan";
import { listAccounts, listCategories } from "@/lib/queries/reference";
import { getDb } from "@/db/client";

export default async function ImportPage() {
  await connection();
  const [accounts, categories, db] = await Promise.all([listAccounts(), listCategories(), getDb()]);
  const bills = selectBills(db).filter((b) => b.active);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/plan" className="text-sm font-medium text-accent">
          ← Plan
        </Link>
        <h1 className="h-page">Import a bank statement</h1>
        <p className="text-sm text-muted">
          Bring in past months in minutes instead of typing them. I&apos;ll sort what I recognise (bills, petrol, subscriptions, ATM withdrawals) and ask only about the rest.
        </p>
      </div>
      <ImportWizard
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, purpose: a.purpose }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type, icon: c.icon }))}
        bills={bills.map((b) => ({ id: b.id, name: b.name }))}
      />
    </div>
  );
}
