import Link from "next/link";
import { PendingMark } from "@/components/PendingMark";
import { ScrollChosenIntoView } from "@/components/ScrollChosenIntoView";
import { cardLook } from "@/lib/card";
import { formatRM } from "@/lib/money";

type Chip = {
  id: number;
  name: string;
  balance: number;
  href: string;
  /** A colour for the 10 px dot, if the caller already has one. Otherwise it comes from `cardColor` + the name (`cardLook`). */
  dot?: string | null;
  /** The account's own card colour (`accounts.cardColor`); with the name it gives the bank's colour when none was chosen. */
  cardColor?: string | null;
};

/**
 * Accounts as a row of pills, each a LINK: on the Add page a tap opens that account's entries; on Activity (and Plan,
 * Insights, Home) the row is the account filter (the chosen one is solid gold, "All" clears it). One 44 px line per chip:
 * a dot in the account's card colour, the name (12.5 px, bold) and, inline and small, the balance. It scrolls sideways on a
 * phone. Balances are derived from transactions, so they are the real ones.
 *
 * `compact` is Home's row: the same line with the NAME only (the balance stays in the link's accessible name, and on the
 * account's own card).
 */
export function AccountChips({
  accounts,
  selectedId = null,
  allHref,
  label = "Accounts",
  compact = false,
  className = "",
}: {
  accounts: Chip[];
  selectedId?: number | null;
  /** When given, a first "All accounts" chip (chosen while nothing is selected) goes here. */
  allHref?: string;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const base = "flex min-h-11 shrink-0 items-center gap-2 rounded-full border-[1.5px] px-3.5 transition";
  const idle = "border-line bg-card hover:border-foreground";
  const chosen = "border-accent-strong bg-accent text-accent-fg";
  return (
    <nav aria-label={label} className={`no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 md:mx-0 md:px-0 ${className}`}>
      {/* The row scrolls sideways on a phone: bring the chosen account into view if it is off-screen. */}
      <ScrollChosenIntoView selected={selectedId} />
      {allHref !== undefined && (
        <Link href={allHref} aria-label="All accounts" aria-current={selectedId === null ? "true" : undefined} className={`${base} justify-center ${selectedId === null ? chosen : idle}`}>
          <span className="text-[12.5px] font-bold">All</span>
          <PendingMark />
        </Link>
      )}
      {accounts.map((a) => {
        const on = a.id === selectedId;
        const dot = a.dot !== undefined ? a.dot : cardLook({ name: a.name, cardColor: a.cardColor ?? null }).bg;
        return (
          <Link
            key={a.id}
            href={a.href}
            aria-current={on ? "true" : undefined}
            aria-label={compact ? `${a.name}, ${formatRM(a.balance)}` : undefined}
            className={`${base} ${on ? chosen : idle}`}
          >
            <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${dot ? "" : "bg-ink-muted"}`} style={dot ? { backgroundColor: dot } : undefined} />
            <span className="text-[12.5px] font-bold">{a.name}</span>
            {!compact && <span className={`num text-[11px] font-semibold ${on ? "" : a.balance < 0 ? "text-danger" : "text-muted"}`}>{formatRM(a.balance)}</span>}
            <PendingMark />
          </Link>
        );
      })}
    </nav>
  );
}
