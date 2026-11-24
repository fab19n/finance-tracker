import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccountCard } from "@/components/account/AccountCard";
import { EmptyState } from "@/components/EmptyState";
import { DuoIcon } from "@/components/DuoIcon";
import { PageHeader } from "@/components/PageHeader";
import { formatRM } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";

export const metadata: Metadata = { title: "Accounts" };

/**
 * The Accounts tab: every account as a card (bank colour, network mark, Main tag) with its balance (derived from its
 * entries, never stored). A card opens that account's own page: the card, its latest movements, Card settings.
 */
export default async function AccountsPage() {
  const accounts = await getAccountBalances();
  // An investment's "balance" is the money put in, not what it is worth now, so it is left out of this total.
  const cash = accounts.filter((a) => a.type !== "investment").reduce((t, a) => t + a.balance, 0);

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        title="Accounts"
        subtitle={`${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
        actions={
          // New accounts, names, opening balances and archiving live in Settings; this is the way there from here.
          <Link href="/settings?tab=accounts" className="btn">
            <Plus size={14} strokeWidth={2.5} aria-hidden /> Add account
          </Link>
        }
      />

      <section className="card" aria-label="Total">
        <p className="label">In your accounts</p>
        <p className={`num figure text-[34px] leading-tight tracking-[-0.02em] ${cash < 0 ? "text-danger" : ""}`}>{formatRM(cash)}</p>
        <p className="sub">Banks, wallets and cash. Investments are on the Invest page.</p>
      </section>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<DuoIcon name="accounts" size={28} aria-hidden />}
          title="Add your first account"
          text="Accounts are where money sits: a bank, an e-wallet, the cash in your pocket."
          primary={{ label: "Add an account", href: "/settings" }}
        />
      ) : (
        <ul className="space-y-3">
          {accounts.map((a) => (
            <li key={a.id}>
              <Link href={`/accounts/${a.id}`} aria-label={`${a.name}: ${formatRM(a.balance)}${a.type === "investment" ? " put in" : ""}. Open`} className="block rounded-[24px] transition active:scale-[0.99]">
                <AccountCard account={a} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
