import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { saveCardSettings } from "@/app/actions/cards";
import { CardForm } from "@/components/account/CardForm";
import { PageHeader } from "@/components/PageHeader";
import { getAccountBalances } from "@/lib/queries/accounts";

export const metadata: Metadata = { title: "Card settings" };

export default async function CardSettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const id = Number((await params).id);
  const error = (await searchParams).error;
  const account = Number.isInteger(id) ? (await getAccountBalances(true)).find((a) => a.id === id) : undefined;
  if (!account) notFound();
  return (
    <div className="max-w-2xl space-y-4">
      {/* Back disc and title only, as the board draws it; the back link's label names the account. */}
      <PageHeader title="Card settings" back={{ href: `/accounts/${id}`, label: `Back to ${account.name}` }} />
      {error && (
        <p role="alert" className="banner banner-danger">
          {error}
        </p>
      )}
      <CardForm account={account} action={saveCardSettings} />
    </div>
  );
}
