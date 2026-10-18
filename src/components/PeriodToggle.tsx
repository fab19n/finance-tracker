import Link from "next/link";

/**
 * Is a "month" a pay cycle (payday to payday: the salary on 26 Sep is October's income) or a calendar month (1 to 31)?
 * Two plain links in a segmented pill; the choice lives in the address, so it survives moving between months.
 */
export function PeriodToggle({ view }: { view: "cycle" | "month" }) {
  const item = (v: "cycle" | "month", label: string) => (
    <Link href={`/dashboard?view=${v}`} aria-current={view === v ? "page" : undefined} className="seg-item px-3.5">
      {label}
    </Link>
  );
  return (
    <nav aria-label="What a month means" className="seg">
      {item("cycle", "Pay cycle")}
      {item("month", "Month")}
    </nav>
  );
}
