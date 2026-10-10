import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { monthLabel, shiftMonth } from "@/lib/dates";

/**
 * Prev / label / next. Cannot navigate past `maxMonth` (or before `minMonth`). One filter row above everything it scopes.
 * `sublabel` says what the "month" really is when it is a pay cycle ("26 Sep - 25 Oct"); `query` keeps other settings
 * (such as the view) in the links.
 */
export function MonthNav({
  month,
  maxMonth,
  minMonth,
  path,
  sublabel,
  query,
}: {
  month: string;
  maxMonth: string;
  minMonth?: string;
  path: string;
  sublabel?: string;
  query?: string;
}) {
  const next = shiftMonth(month, 1);
  const before = shiftMonth(month, -1);
  const canNext = next <= maxMonth;
  const canPrev = minMonth === undefined || before >= minMonth;
  const href = (m: string) => `${path}?month=${m}${query ? `&${query}` : ""}`;
  return (
    <div className="flex items-center gap-1">
      {canPrev ? (
        <Link href={href(before)} aria-label="Previous month" className="btn !px-2.5">
          <ChevronLeft size={18} />
        </Link>
      ) : (
        <span aria-hidden className="btn !px-2.5 pointer-events-none opacity-30">
          <ChevronLeft size={18} />
        </span>
      )}
      <span className="min-w-36 text-center">
        <span className="block font-semibold">{monthLabel(month)}</span>
        {sublabel && <span className="block text-xs text-muted">{sublabel}</span>}
      </span>
      {canNext ? (
        <Link href={href(next)} aria-label="Next month" className="btn !px-2.5">
          <ChevronRight size={18} />
        </Link>
      ) : (
        <span aria-hidden className="btn !px-2.5 pointer-events-none opacity-30">
          <ChevronRight size={18} />
        </span>
      )}
    </div>
  );
}
