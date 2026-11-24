import { Plus, TrendingDown, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccountCard } from "@/components/account/AccountCard";
import { DuoIcon } from "@/components/DuoIcon";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { PageHeader } from "@/components/PageHeader";
import { shiftDays, todayISO } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { recentChange } from "@/lib/movements";
import { getAccountBalances, getRecentFlow, type AccountBalance } from "@/lib/queries/accounts";

export const metadata: Metadata = { title: "Accounts" };

/** The list's three views: everything, banks (and investment accounts), wallets (e-wallets and cash). */
const KINDS = [
  { key: "all", label: "All" },
  { key: "banks", label: "Banks" },
  { key: "wallets", label: "Wallets" },
] as const;
type Kind = (typeof KINDS)[number]["key"];
const inKind = (a: AccountBalance, k: Kind) => k === "all" || (k === "banks" ? a.type === "bank" || a.type === "investment" : a.type === "ewallet" || a.type === "cash");

/** How far back the net-worth pill looks. */
const CHANGE_DAYS = 30;

const href = (kind: Kind, archived: boolean) => {
  const q = new URLSearchParams();
  if (kind !== "all") q.set("kind", kind);
  if (archived) q.set("archived", "1");
  return `/accounts${q.size ? `?${q}` : ""}`;
};

function CardLink({ a }: { a: AccountBalance }) {
  return (
    <Link
      href={`/accounts/${a.id}`}
      aria-label={`${a.name}${a.archived ? " (archived)" : ""}: ${formatRM(a.balance)}${a.type === "investment" ? " put in" : ""}. Open`}
      className="block rounded-[22px] transition active:scale-[0.99]"
    >
      <AccountCard account={a} size="lg" />
    </Link>
  );
}

/**
 * The Accounts tab: the total, then the Main account as one large card and every other account as a compact card in a
 * grid (bank colour, network mark), each opening that account's own page. Balances are derived from entries, never stored.
 */
export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ kind?: string; archived?: string }> }) {
  const sp = await searchParams;
  const kind: Kind = KINDS.find((k) => k.key === sp.kind)?.key ?? "all";
  const showArchived = sp.archived === "1";
  const everything = await getAccountBalances(true);
  const live = everything.filter((a) => !a.archived);
  const archivedCount = everything.length - live.length;
  // An investment's "balance" is the money put in, not what it is worth now, so it is left out of this total.
  const counted = live.filter((a) => a.type !== "investment");
  const cash = counted.reduce((t, a) => t + a.balance, 0);
  const today = todayISO();
  const change = recentChange(await getRecentFlow(counted.map((a) => a.id), shiftDays(today, -(CHANGE_DAYS - 1)), today));

  const shown = (showArchived ? everything : live).filter((a) => inKind(a, kind));
  // The Main account (the spending role) is the one big card; with none chosen every account is a small one.
  const main = shown.find((a) => a.purpose === "spending" && !a.archived);
  const others = shown.filter((a) => a !== main);

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        title="Accounts"
        actions={
          <Link href="/accounts/new" aria-label="Add account" className="grid size-11 place-items-center rounded-full bg-card-subtle transition hover:opacity-80">
            <Plus size={20} strokeWidth={2.4} aria-hidden />
          </Link>
        }
      />

      <section aria-label="Net worth">
        <p className="label !mb-0.5 uppercase tracking-[0.1em]">Net worth</p>
        <p className={`num figure text-[40px] leading-[1.05] tracking-[-0.02em] ${cash < 0 ? "text-danger" : ""}`}>
          <Money sen={cash} />
        </p>
        {change !== null && (
          <p className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-line bg-card py-1 pl-2 pr-2.5 text-xs font-bold ${change < 0 ? "text-danger" : "text-good"}`}>
            {change < 0 ? <TrendingDown size={16} strokeWidth={2.2} aria-hidden /> : <TrendingUp size={16} strokeWidth={2.2} aria-hidden />}
            <span className="num">
              {change < 0 ? "−" : "+"}
              {formatRM(Math.abs(change))}
            </span>
            <span className="sr-only">income minus spending </span>
            in the last {CHANGE_DAYS} days
          </p>
        )}
        <p className="sub mt-1.5">Banks, wallets and cash. Investments are on the Invest page.</p>
      </section>

      {live.length === 0 && archivedCount === 0 ? (
        <EmptyState
          icon={<DuoIcon name="accounts" size={28} aria-hidden />}
          title="Add your first account"
          text="Accounts are where money sits: a bank, an e-wallet, the cash in your pocket."
          primary={{ label: "Add an account", href: "/accounts/new" }}
        />
      ) : (
        <>
          <nav aria-label="Kind of account" className="seg">
            {KINDS.map((k) => (
              <Link key={k.key} href={href(k.key, showArchived)} replace scroll={false} aria-current={k.key === kind ? "true" : undefined} className="seg-item">
                {k.label}
              </Link>
            ))}
          </nav>

          {shown.length === 0 ? (
            <p className="sub text-center">No {kind === "banks" ? "bank" : "wallet"} accounts{showArchived ? "" : " yet"}.</p>
          ) : (
            <>
              {main && <CardLink a={main} />}
              {others.length > 0 && (
                <ul className="grid grid-cols-2 gap-2">
                  {others.map((a) => (
                    <li key={a.id} className="min-w-0">
                      <Link
                        href={`/accounts/${a.id}`}
                        aria-label={`${a.name}${a.archived ? " (archived)" : ""}: ${formatRM(a.balance)}${a.type === "investment" ? " put in" : ""}. Open`}
                        className="block rounded-[18px] transition active:scale-[0.99]"
                      >
                        <AccountCard account={a} size="sm" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {archivedCount > 0 && (
            <p className="sub text-center">
              {archivedCount} archived account{archivedCount === 1 ? "" : "s"} ·{" "}
              <Link href={href(kind, !showArchived)} replace scroll={false} className="inline-flex min-h-11 items-center font-extrabold text-accent-strong underline-offset-2 hover:underline">
                {showArchived ? "Hide" : "Show"}
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
