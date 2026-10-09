import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { monthLabel, shiftMonth } from "@/lib/dates";

/** Prev / label / next. Cannot navigate past `maxMonth`. One filter row above everything it scopes. */
export function MonthNav({ month, maxMonth, path }: { month: string; maxMonth: string; path: string }) {
  const next = shiftMonth(month, 1);
  const canNext = next <= maxMonth;
  return (
    <div className="flex items-center gap-1">
      <Link href={`${path}?month=${shiftMonth(month, -1)}`} aria-label="Previous month" className="btn !px-2.5">
        <ChevronLeft size={18} />
      </Link>
      <span className="min-w-36 text-center font-semibold">{monthLabel(month)}</span>
      {canNext ? (
        <Link href={`${path}?month=${next}`} aria-label="Next month" className="btn !px-2.5">
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
