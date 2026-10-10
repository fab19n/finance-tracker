import Link from "next/link";

/**
 * Is a "month" a pay cycle (payday to payday: the salary on 26 Sep is October's income) or a calendar month (1 to 31)?
 * Two plain links; the choice lives in the address, so it survives moving between months.
 */
export function PeriodToggle({ view }: { view: "cycle" | "month" }) {
  const item = (v: "cycle" | "month", label: string) => (
    <Link
      href={`/dashboard?view=${v}`}
      aria-current={view === v ? "true" : undefined}
      className={`rounded-lg px-2.5 py-1 text-sm font-medium ${view === v ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="What a month means" className="flex gap-1 rounded-xl border border-line p-1">
      {item("cycle", "Pay cycle")}
      {item("month", "Calendar month")}
    </nav>
  );
}
