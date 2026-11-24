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
  collapsible = false,
}: {
  name: string;
  history: History;
  period: string;
  note?: string;
  /** A link to the same account's statement (CSV): money in, money out and the balance after each line. */
  statementHref?: string;
  /** Keep the header (balance and change) and fold the chart, figures and download under a "Show chart and details" summary: a short page on a phone. */
  collapsible?: boolean;
}) {
  const { change } = history;
  const up = change > 0;
  const down = change < 0;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const tone = up ? "bg-good-soft text-good" : down ? "bg-danger-soft text-danger" : "bg-card-subtle text-muted";
  const body = (
    <>
      <div className="mt-1">
        <BalanceChart data={history.points} name={name} />
      </div>
      <dl className="mt-1 grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Start", v: history.start, d: undefined as string | undefined },
          { label: "Low", v: history.low?.balance ?? history.start, d: history.low?.date },
          { label: "High", v: history.high?.balance ?? history.end, d: history.high?.date },
        ].map((r) => (
          <div key={r.label} className="rounded-2xl bg-card-subtle px-1.5 py-2">
            <dt className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">{r.label}</dt>
            <dd className="num mt-0.5 text-[12.5px] font-extrabold">{formatRMWhole(r.v)}</dd>
            {r.d && <dd className="text-[10.5px] font-semibold text-muted">{shortDate(r.d)}</dd>}
          </div>
        ))}
      </dl>
      <ChartTable
        caption={`${name} balance at the end of each day shown`}
        columns={["Date", "Balance"]}
        rows={history.points.map((p) => [shortDate(p.date), formatRM(p.balance)])}
      />
      {note && <p className="sub mt-2">{note}</p>}
      {statementHref && (
        <Link href={statementHref} className="btn mt-3 w-full" prefetch={false}>
          <FileText size={14} strokeWidth={2.5} aria-hidden />
          Download statement
        </Link>
      )}
    </>
  );
  return (
    <section className="card" aria-labelledby="balance-history">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="balance-history" className="h2">
            {name} balance
          </h2>
          <p className="sub">{period}</p>
        </div>
        <p className={`num font-display text-[19px] font-semibold leading-tight tracking-[-0.01em] ${history.end < 0 ? "text-danger" : ""}`}>
          {history.end < 0 ? "−" : ""}
          {formatRM(Math.abs(history.end))}
        </p>
      </div>
      <div className="mt-1.5">
        <span className={`pill ${tone}`}>
          <Icon size={13} strokeWidth={2.5} aria-hidden />
          {up ? "Up " : down ? "Down " : "No change"}
          {change !== 0 && formatRMWhole(Math.abs(change))}
        </span>
      </div>
      {collapsible ? (
        <details className="mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-xs font-extrabold text-accent-strong [&::-webkit-details-marker]:hidden">
            Show chart and details
          </summary>
          {body}
        </details>
      ) : (
        body
      )}
    </section>
  );
}
