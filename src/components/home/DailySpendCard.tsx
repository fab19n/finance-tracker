import Link from "next/link";
import type { DailySpend, SpendDay } from "@/lib/analytics/daily-spend";
import { daySquareText } from "@/lib/analytics/dashboard-text";
import { shortDate, shortMonthLabel } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { qs } from "@/lib/queries/filters";

const SETTING = "/settings?tab=payday#daily-limit";
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.1em] text-muted";
const ACTION = "inline-flex min-h-11 items-center text-xs font-extrabold text-accent-strong underline underline-offset-2";
/** The rows named down the side, as in the calendar this is modelled on: Monday, Wednesday, Friday. */
const WEEKDAYS = [
  { row: 1, name: "Mon" },
  { row: 3, name: "Wed" },
  { row: 5, name: "Fri" },
];

/**
 * Home's daily spending calendar, a contribution graph: one small square per day, weeks as columns and weekdays as rows,
 * for the weeks leading up to the end of the period on screen. It fills its card by showing MORE WEEKS where there is room,
 * never by growing or stretching the squares. A day's gold deepens as it nears your daily limit and turns red once past it.
 * Every day that has happened opens its spending in Activity, which lists everything, including what the limit doesn't
 * count. Without a limit there is nothing to colour against, so the card only asks for one.
 *
 * Two of the app's rules give way here, on purpose, to keep it the size of a contribution graph. The squares show colour
 * ALONE (no number, no mark), so the date, the amount and whether it is over are in each square's tooltip and spoken
 * label; and a square's tap area is about 24 px, not the usual 40.
 */
export function DailySpendCard({ daily, className = "" }: { daily: DailySpend | null; className?: string }) {
  if (!daily) {
    return (
      <section className={`card ${className}`} aria-labelledby="daily">
        <h2 id="daily" className={EYEBROW}>
          Daily spending
        </h2>
        <p className="sub mt-1">Set a daily limit to see each day as a square: gold up to the limit, red over it.</p>
        <Link href={SETTING} className={ACTION}>
          Set a daily limit
        </Link>
      </section>
    );
  }

  const { limit, weeks } = daily;
  const nameOf = (month: string) => shortMonthLabel(month).split(" ")[0];
  const monthAt = new Map(daily.months.map((m) => [m.week, nameOf(m.month)]));
  const lastDay = daily.days.at(-1)?.date;

  return (
    // min-w-0: in the desktop grid the card must not push its column wider; it shows fewer weeks instead.
    <section className={`card flex min-w-0 flex-col ${className}`} aria-labelledby="daily">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <h2 id="daily" className={EYEBROW}>
          Daily spending
        </h2>
        <Link href={SETTING} className={`${ACTION} -my-2.5`}>
          Change limit
        </Link>
      </div>

      {/* In the desktop row the card is as tall as its neighbours: the calendar and legend sit in the middle of the room. */}
      <div className="flex flex-1 flex-col justify-center">
        {/* All the weeks are here, oldest first; globals.css shows the newest ones that fit, one more for every 24 px. */}
        <div className="day-calendar mt-2">
          <div role="group" aria-label={`Spending day by day${lastDay ? ` in the weeks up to ${shortDate(lastDay)}` : ""}, against your daily limit of ${formatRM(limit)}`} className="flex">
            <div aria-hidden className="day-side">
              {WEEKDAYS.map((w) => (
                <span key={w.name} className="self-center text-[11px] font-bold text-muted" style={{ gridRow: w.row + 2 }}>
                  {w.name}
                </span>
              ))}
            </div>
            {/* Written week by week, so the keyboard walks the days in date order. */}
            {weeks.map((week, w) => (
              <div key={w} className="day-week">
                <span aria-hidden className="h-4 whitespace-nowrap pl-0.5 text-[11px] font-bold leading-4 text-muted">
                  {/* A month is named where it begins. Whichever week is leftmost on screen also says its month (shown by
                      globals.css), unless the next week's name would run into it. */}
                  {monthAt.get(w) ?? <span className="day-edge">{monthAt.has(w + 1) ? "" : nameOf(week.find(Boolean)!.date.slice(0, 7))}</span>}
                </span>
                {week.map((d, row) => (d ? <Square key={d.date} day={d} limit={limit} /> : <span key={row} aria-hidden className="day" />))}
              </div>
            ))}
          </div>
        </div>

        <ul className="mt-1 flex items-center justify-between gap-3 whitespace-nowrap text-[11px] font-bold text-muted" aria-label="Legend">
          <li className="flex items-center gap-[3px]">
            <span className="mr-0.5">Less</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <span key={level} aria-hidden className={`day-key day-${level}`} />
            ))}
            <span className="ml-0.5">More</span>
            <span className="sr-only">, from nothing up to your limit of {formatRM(limit)}</span>
          </li>
          <li className="flex items-center gap-1">
            <span aria-hidden className="day-key day-over" />
            Over
          </li>
        </ul>
      </div>
    </section>
  );
}

function Square({ day, limit }: { day: SpendDay; limit: number }) {
  const text = daySquareText(day, limit);
  if (day.future) {
    return (
      <span aria-hidden title={text} className="day">
        <span className="day-box day-future" />
      </span>
    );
  }
  return (
    <Link
      href={`/transactions${qs({ month: "all", from: day.date, to: day.date, type: "expense" })}`}
      // A month of squares would otherwise each fetch Activity ahead of any tap.
      prefetch={false}
      className="day transition active:scale-[0.9]"
      title={text}
      aria-label={`${text}. See its entries`}
      aria-current={day.isToday ? "date" : undefined}
    >
      <span className={`day-box day-${day.level} ${day.isToday ? "day-today" : ""}`} />
    </Link>
  );
}
