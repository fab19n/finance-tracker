import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { monthLabel, shiftMonth } from "@/lib/dates";

const BTN = "grid size-8 shrink-0 place-items-center rounded-full transition";

/**
 * The period navigator: a pill with prev / label / next. Cannot navigate past `maxMonth` (or before `minMonth`); the end it
 * can't go to is drawn plain and unclickable. `sublabel` goes under the pill: it says what the "month" really is when it is
 * a pay cycle ("26 Sep - 25 Oct"), or is a link such as "Show all time". `query` keeps other settings (such as the view or
 * a search) in the links.
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
    <div className={className}>
      <div className="flex items-center justify-between gap-2 rounded-full border-[1.5px] border-line bg-card p-1">
        {canPrev ? (
          <Link href={href(before)} aria-label="Previous month" className={`${BTN} bg-card-subtle hover:bg-nav-active`}>
            <ChevronLeft size={16} strokeWidth={2.5} />
          </Link>
        ) : (
          <span aria-hidden className={`${BTN} pointer-events-none text-ink-muted`}>
            <ChevronLeft size={16} strokeWidth={2.5} />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-center text-xs font-extrabold">{monthLabel(month)}</span>
        {canNext ? (
          <Link href={href(next)} aria-label="Next month" className={`${BTN} bg-card-subtle hover:bg-nav-active`}>
            <ChevronRight size={16} strokeWidth={2.5} />
          </Link>
        ) : (
          <span aria-hidden className={`${BTN} pointer-events-none text-ink-muted`}>
            <ChevronRight size={16} strokeWidth={2.5} />
          </span>
        )}
      </div>
      {sublabel && <p className="mt-1.5 text-center text-[11px] font-bold text-muted">{sublabel}</p>}
    </div>
  );
}
