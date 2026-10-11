import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { monthLabel, shiftMonth } from "@/lib/dates";

const BTN = "grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card transition";

/**
 * Prev / label / next. Cannot navigate past `maxMonth` (or before `minMonth`); the end it can't go to is drawn disabled.
 * `sublabel` goes under the label: it says what the "month" really is when it is a pay cycle ("26 Sep - 25 Oct"), or is a
 * link such as "Show all time". `query` keeps other settings (such as the view or a search) in the links.
 */
export function MonthNav({
  month,
  maxMonth,
  minMonth,
  path,
  sublabel,
  query,
  className = "",
}: {
  month: string;
  maxMonth: string;
  minMonth?: string;
  path: string;
  sublabel?: ReactNode;
  query?: string;
  className?: string;
}) {
  const next = shiftMonth(month, 1);
  const before = shiftMonth(month, -1);
  const canNext = next <= maxMonth;
  const canPrev = minMonth === undefined || before >= minMonth;
  const href = (m: string) => `${path}?month=${m}${query ? `&${query}` : ""}`;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {canPrev ? (
        <Link href={href(before)} aria-label="Previous month" className={`${BTN} hover:bg-background`}>
          <ChevronLeft size={18} />
        </Link>
      ) : (
        <span aria-hidden className={`${BTN} pointer-events-none opacity-30`}>
          <ChevronLeft size={18} />
        </span>
      )}
      <span className="min-w-36 flex-1 text-center">
        <span className="block text-[15px] font-bold">{monthLabel(month)}</span>
        {sublabel && <span className="block text-xs text-muted">{sublabel}</span>}
      </span>
      {canNext ? (
        <Link href={href(next)} aria-label="Next month" className={`${BTN} hover:bg-background`}>
          <ChevronRight size={18} />
        </Link>
      ) : (
        <span aria-hidden className={`${BTN} pointer-events-none opacity-30`}>
          <ChevronRight size={18} />
        </span>
      )}
    </div>
  );
}
