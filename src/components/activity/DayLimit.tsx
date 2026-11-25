import Link from "next/link";
import type { SpendDay } from "@/lib/analytics/daily-spend";
import { limitStanding } from "@/lib/analytics/dashboard-text";
import { formatRM } from "@/lib/money";

/**
 * Under Activity's totals when it shows one day (what a tap on Home's daily calendar opens): the part of that day's
 * spending the daily limit counts, beside the calendar square's own shade. "Money out" above is everything; this is
 * what coloured the square. Over the limit is said in words as well as colour.
 */
export function DayLimit({ day, limit }: { day: SpendDay; limit: number }) {
  return (
    <section className="flex items-start gap-3 rounded-2xl bg-card-subtle px-2.5 py-2" aria-labelledby="day-limit">
      <span aria-hidden className={`mt-1 size-9 shrink-0 rounded-lg day-${day.level} ${day.level === 0 ? "border border-line" : ""}`} />
      <div className="min-w-0 flex-1">
        <h2 id="day-limit" className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-muted">
          Counts to daily limit
        </h2>
        <p className="num figure mt-0.5 text-[19px] font-semibold leading-tight tracking-[-0.02em]">{formatRM(day.spent)}</p>
        <p className={`text-xs font-extrabold ${day.level === "over" ? "text-danger" : ""}`}>{limitStanding(day.spent, limit)}</p>
        {day.leftOut > 0 && <p className="sub mt-0.5">{formatRM(day.leftOut)} more doesn&apos;t count: bills, Needs and categories you left out.</p>}
      </div>
      <Link href="/settings?tab=payday#daily-limit" className="-my-1 inline-flex min-h-11 shrink-0 items-center text-xs font-extrabold text-accent-strong underline underline-offset-2">
        Change<span className="sr-only"> what the daily limit counts</span>
      </Link>
    </section>
  );
}
