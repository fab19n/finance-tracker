import type { Metadata } from "next";
import { addAccount } from "@/app/actions/cards";
import { NewAccountForm } from "@/components/account/NewAccountForm";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "New account" };

export default async function NewAccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const error = (await searchParams).error;
  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="New account" back={{ href: "/accounts", label: "Back to Accounts" }} />
      {error && (
        <p role="alert" className="banner banner-danger">
          {error}
        </p>
      )}
      <NewAccountForm action={addAccount} />
    </div>
  );
}
