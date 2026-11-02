import Link from "next/link";
import { ScrollChosenIntoView } from "@/components/ScrollChosenIntoView";
import { formatRM } from "@/lib/money";

type Chip = { id: number; name: string; balance: number; href: string };

/**
 * Accounts as a row of pills, each showing its balance and each a LINK: on the Add page a tap opens that account's
 * entries; on Activity the row is the account filter (the chosen one is solid, "All accounts" clears it). It scrolls
 * sideways on a phone. Balances are derived from transactions, so they are the real ones.
 */
export function AccountChips({
  accounts,
  selectedId = null,
  allHref,
  label = "Accounts",
}: {
  accounts: Chip[];
  selectedId?: number | null;
  /** When given, a first "All accounts" chip (chosen while nothing is selected) goes here. */
  allHref?: string;
  label?: string;
}) {
  const base = "flex shrink-0 flex-col items-start rounded-full border-[1.5px] px-3.5 py-1.5 transition";
  const idle = "border-line bg-card hover:border-foreground";
  const chosen = "border-foreground bg-foreground text-background";
  return (
    <nav aria-label={label} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 md:mx-0 md:px-0">
      {/* The row scrolls sideways on a phone: bring the chosen account into view if it is off-screen. */}
      <ScrollChosenIntoView selected={selectedId} />
      {allHref !== undefined && (
        <Link href={allHref} aria-current={selectedId === null ? "true" : undefined} className={`${base} justify-center ${selectedId === null ? chosen : idle}`}>
          <span className="text-[11px] font-extrabold">All accounts</span>
        </Link>
      )}
      {accounts.map((a) => {
        const on = a.id === selectedId;
        return (
          <Link key={a.id} href={a.href} aria-current={on ? "true" : undefined} className={`${base} ${on ? chosen : idle}`}>
            <span className="text-[11px] font-extrabold">{a.name}</span>
            <span className={`num text-[11px] font-bold ${on ? "" : a.balance < 0 ? "text-danger" : "text-muted"}`}>{formatRM(a.balance)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
