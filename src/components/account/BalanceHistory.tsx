import { ArrowDownRight, ArrowUpRight, FileText, Minus } from "lucide-react";
import Link from "next/link";
import { ChartTable } from "@/components/ChartTable";
import { BalanceChart } from "@/components/charts/BalanceChart";
import type { BalanceHistory as History } from "@/lib/analytics/ledger";
import { shortDate } from "@/lib/dates";
import { formatRM, formatRMWhole } from "@/lib/money";

/**
 * One account's balance through a period: where it ended, how far it moved, its lowest and highest day, and the chart.
 * The balance is always the account's real one (opening balance and every earlier entry included), whatever filters are on
 * the list beside it. Direction is an arrow and a word as well as a colour.
 */
export function BalanceHistory({
  name,
  history,
  period,
  note,
  statementHref,
}: {
  name: string;
  history: History;
  period: string;
  note?: string;
  /** A link to the same account's statement (CSV): money in, money out and the balance after each line. */
  statementHref?: string;
}) {
  const { change } = history;
  const up = change > 0;
  const down = change < 0;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const tone = up ? "bg-good-soft text-good" : down ? "bg-danger-soft text-danger" : "bg-card-subtle text-muted";
  return (
    <section className="card" aria-labelledby="balance-history">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="balance-history" className="h2">
            {name} balance
          </h2>
          <p className="sub">{period}</p>
        </div>
        <span className={`pill ${tone}`}>
          <Icon size={13} strokeWidth={2.5} aria-hidden />
          {up ? "Up " : down ? "Down " : "No change"}
          {change !== 0 && formatRMWhole(Math.abs(change))}
        </span>
      </div>
      <p className={`num mt-2 text-[28px] font-black leading-none tracking-[-0.02em] ${history.end < 0 ? "text-danger" : ""}`}>
        {history.end < 0 ? "−" : ""}
        {formatRM(Math.abs(history.end))}
      </p>
      <p className="sub mt-1">
        {history.low && history.high && history.low.balance !== history.high.balance ? (
          <>
            Lowest {formatRM(history.low.balance)} on {shortDate(history.low.date)} · highest {formatRM(history.high.balance)} on {shortDate(history.high.date)}
          </>
        ) : (
          <>Started at {formatRM(history.start)}</>
        )}
      </p>
      <div className="mt-2">
        <BalanceChart data={history.points} name={name} />
      </div>
      <ChartTable
        caption={`${name} balance at the end of each day shown`}
        columns={["Date", "Balance"]}
        rows={history.points.map((p) => [shortDate(p.date), formatRM(p.balance)])}
      />
      {note && <p className="sub mt-2">{note}</p>}
      {statementHref && (
        <Link href={statementHref} className="btn mt-3" prefetch={false}>
          <FileText size={14} strokeWidth={2.5} aria-hidden />
          Download statement
        </Link>
      )}
    </section>
  );
}
