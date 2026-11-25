import Link from "next/link";
import type { CSSProperties } from "react";
import { ChartTable } from "@/components/ChartTable";
import type { DailySpend, SpendDay } from "@/lib/analytics/daily-spend";
import { dailySummary, daySquareText } from "@/lib/analytics/dashboard-text";
import { dayLabel, shortMonthLabel } from "@/lib/dates";
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
 * Home's daily spending calendar: one square per day of the period on screen, weeks as columns and weekdays as rows. A
 * square's gold deepens as the day nears your daily limit and turns red, with a "!", once past it. Every day that has
 * happened opens its spending in Activity (bills included there; the square says how much of it was bills). Without a
 * limit there is nothing to colour against, so the card only asks for one.
 */
export function DailySpendCard({ daily, className = "" }: { daily: DailySpend | null; className?: string }) {
  if (!daily) {
    return (
      <section className={`card ${className}`} aria-labelledby="daily">
        <h2 id="daily" className={EYEBROW}>
          Daily spending
        </h2>
        <p className="sub mt-1">Set a daily limit and every day gets a square: its gold deepens as you near the limit, and it turns red when you go over.</p>
        <Link href={SETTING} className={ACTION}>
          Set a daily limit
        </Link>
      </section>
    );
  }

  const { limit, weeks } = daily;
  const happened = daily.days.filter((d) => !d.future);
  // 44 px squares when there is room. A 26 px label column and 4 px gaps leave 40 px each for six weeks on a 360 px phone.
  const width = 26 + weeks.length * 48;
  // More than six weeks (a payday long overdue): keep the squares tappable and let the calendar scroll sideways.
  const narrowest = weeks.length > 6 ? "2.5rem" : "0px";

  return (
    <section className={`card ${className}`} aria-labelledby="daily">
      <div className="flex items-center justify-between gap-2">
        <h2 id="daily" className={EYEBROW}>
          Daily spending
        </h2>
        <Link href={SETTING} className={`${ACTION} -my-2.5`}>
          Change limit
        </Link>
      </div>
      <div className="mt-1 md:grid md:grid-cols-[var(--cal)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10" style={{ "--cal": `${width}px` } as CSSProperties}>
        <div className="md:col-start-2 md:row-start-1">
          <p className="text-[13px] font-extrabold">{dailySummary(daily.overDays, daily.daysSoFar, limit)}</p>
          <p className="sub mt-0.5">Bill payments are not counted. Tap a day to see what you spent.</p>
        </div>

        {/* The padding keeps today's ring and the focus ring from being clipped by the sideways scroll. */}
        <div className="-mx-1 mt-2 overflow-x-auto p-1 md:col-start-1 md:row-span-2 md:row-start-1 md:mt-0">
          <div
            role="group"
            aria-label="Spending day by day"
            className="grid gap-1"
            style={{ maxWidth: width, gridTemplateColumns: `1.625rem repeat(${weeks.length}, minmax(${narrowest}, 1fr))` }}
          >
            {daily.months.map((m) => (
              <span key={m.month} aria-hidden className="whitespace-nowrap text-[11px] font-bold text-muted" style={{ gridColumn: m.week + 2, gridRow: 1 }}>
                {shortMonthLabel(m.month).split(" ")[0]}
              </span>
            ))}
            {WEEKDAYS.map((w) => (
              <span key={w.name} aria-hidden className="self-center text-[11px] font-bold text-muted" style={{ gridColumn: 1, gridRow: w.row + 2 }}>
                {w.name}
              </span>
            ))}
            {/* Written week by week, so the keyboard walks the days in date order. */}
            {weeks.map((week, w) => week.map((d, row) => d && <Square key={d.date} day={d} limit={limit} style={{ gridColumn: w + 2, gridRow: row + 2 }} />))}
          </div>
        </div>

        <div className="md:col-start-2 md:row-start-2">
          <ul className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11.5px] font-semibold md:mt-3" aria-label="Legend">
            <li className="flex items-center gap-1">
              <span className="mr-0.5">RM 0</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <span key={level} aria-hidden className={`day-key day-${level}`} />
              ))}
              <span className="num ml-0.5">
                <span className="sr-only">deepening in four steps up to </span>
                {formatRM(limit)}
              </span>
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="day-key day-over">
                !
              </span>
              Over the limit
            </li>
          </ul>
          <ChartTable
            caption={`Daily spending against a limit of ${formatRM(limit)}`}
            columns={["Day", "Spent", "Over by", "Bills, not counted"]}
            rows={happened.map((d) => [
              dayLabel(d.date),
              formatRM(d.spent),
              d.level === "over" ? formatRM(d.spent - limit) : "–",
              d.bills > 0 ? formatRM(d.bills) : "–",
            ])}
          />
        </div>
      </div>
    </section>
  );
}

function Square({ day, limit, style }: { day: SpendDay; limit: number; style: CSSProperties }) {
  const text = daySquareText(day, limit);
  const number = Number(day.date.slice(8, 10));
  if (day.future) {
    return (
      <span aria-hidden title={text} className="day day-future" style={style}>
        {number}
      </span>
    );
  }
  return (
    <Link
      href={`/transactions${qs({ month: "all", from: day.date, to: day.date, type: "expense" })}`}
      // A month of squares would otherwise each fetch Activity ahead of any tap.
      prefetch={false}
      className={`day day-${day.level} ${day.isToday ? "day-today" : ""} transition active:scale-[0.97]`}
      style={style}
      title={text}
      aria-label={`${text}. See its entries`}
      aria-current={day.isToday ? "date" : undefined}
    >
      {number}
      {day.level === "over" && (
        <span aria-hidden className="absolute right-1 top-0.5 text-[11px] font-black leading-none">
          !
        </span>
      )}
    </Link>
  );
}
