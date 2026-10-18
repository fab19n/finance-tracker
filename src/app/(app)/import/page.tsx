import { connection } from "next/server";
import { ImportWizard } from "@/components/import/ImportWizard";
import { selectBills } from "@/lib/queries/plan";
import { listAccounts, listCategories } from "@/lib/queries/reference";
import { selectShares } from "@/lib/queries/shares";
import { getDb } from "@/db/client";

export default async function ImportPage() {
  await connection();
  const [accounts, categories, db] = await Promise.all([listAccounts(), listCategories(), getDb()]);
  const bills = selectBills(db).filter((b) => b.active);

  // The page's <h1> ("Import statement", with the step as its subtitle) is drawn by the wizard, because the step is its state.
  return (
    <ImportWizard
      accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, purpose: a.purpose }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type, icon: c.icon }))}
      bills={bills.map((b) => ({ id: b.id, name: b.name }))}
      shares={selectShares(db).map((s) => ({ id: s.id, label: `${s.billName} · ${s.name}` }))}
    />
  );
}
