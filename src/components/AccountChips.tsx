import Link from "next/link";
import { PendingMark } from "@/components/PendingMark";
import { ScrollChosenIntoView } from "@/components/ScrollChosenIntoView";
import { formatRM } from "@/lib/money";

type Chip = {
  id: number;
  name: string;
  balance: number;
  href: string;
  /** The account's card colour, drawn as a 10 px dot in the compact row (null: the plain grey one). */
  dot?: string | null;
};

/**
 * Accounts as a row of pills, each showing its balance and each a LINK: on the Add page a tap opens that account's
 * entries; on Activity the row is the account filter (the chosen one is solid gold, "All accounts" clears it). It scrolls
 * sideways on a phone. Balances are derived from transactions, so they are the real ones.
 *
 * `compact` is Home's row: one 44 px line per chip, "All", a dot in the account's card colour and the NAME only (the balance
 * stays in the link's accessible name, and on the account's own card).
 */
export function AccountChips({
  accounts,
  selectedId = null,
  allHref,
  label = "Accounts",
  compact = false,
}: {
  accounts: Chip[];
  selectedId?: number | null;
  /** When given, a first "All accounts" chip (chosen while nothing is selected) goes here. */
  allHref?: string;
  label?: string;
  compact?: boolean;
}) {
  const base = compact
    ? "flex min-h-11 shrink-0 items-center gap-2 rounded-full border-[1.5px] px-3.5 transition"
    : "flex shrink-0 flex-col items-start rounded-full border-[1.5px] px-3.5 py-1.5 transition";
  const idle = "border-line bg-card hover:border-foreground";
  const chosen = "border-accent-strong bg-accent text-accent-fg";
  return (
    <nav aria-label={label} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 md:mx-0 md:px-0">
      {/* The row scrolls sideways on a phone: bring the chosen account into view if it is off-screen. */}
      <ScrollChosenIntoView selected={selectedId} />
      {allHref !== undefined && (
        <Link href={allHref} aria-label={compact ? "All accounts" : undefined} aria-current={selectedId === null ? "true" : undefined} className={`${base} justify-center ${selectedId === null ? chosen : idle}`}>
          <span className={compact ? "text-xs font-extrabold" : "text-[11px] font-extrabold"}>{compact ? "All" : "All accounts"}</span>
          <PendingMark />
        </Link>
      )}
      {accounts.map((a) => {
        const on = a.id === selectedId;
        return (
          <Link
            key={a.id}
            href={a.href}
            aria-current={on ? "true" : undefined}
            aria-label={compact ? `${a.name}, ${formatRM(a.balance)}` : undefined}
            className={`${base} ${on ? chosen : idle}`}
          >
            {compact && <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${a.dot ? "" : "bg-ink-muted"}`} style={a.dot ? { backgroundColor: a.dot } : undefined} />}
            <span className={compact ? "text-xs font-extrabold" : "text-[11px] font-extrabold"}>{a.name}</span>
            {!compact && <span className={`num text-[11px] font-bold ${on ? "" : a.balance < 0 ? "text-danger" : "text-muted"}`}>{formatRM(a.balance)}</span>}
            <PendingMark />
          </Link>
        );
      })}
    </nav>
  );
}
