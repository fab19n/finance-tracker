import { FileText } from "lucide-react";
import Link from "next/link";
import { ChartTable } from "@/components/ChartTable";
import { BalanceChart } from "@/components/charts/BalanceChart";
import { bareRM } from "@/components/activity/filter-logic";
import type { BalanceHistory as History } from "@/lib/analytics/ledger";
import { shortDate } from "@/lib/dates";
import { Money } from "@/components/Money";
import { formatRM } from "@/lib/money";

/**
 * One account's balance through a period, the way the design draws it: a "Balance" label with the figure on the right, the
 * chart, then ONE line with where it started and its lowest and highest day. "Download statement" is a full-width button
 * under the card. The balance is always the account's real one (opening balance and every earlier entry included), whatever
 * filters are on the list beside it. The period and the change are in words for a screen reader (and in the table under the
 * chart), so nothing hangs on the line's colour.
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
  const low = history.low?.balance ?? history.start;
  const high = history.high?.balance ?? history.end;
  const dir = history.change > 0 ? "up" : history.change < 0 ? "down" : "unchanged";
  return (
    <>
      <section className="card" aria-labelledby="balance-history">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="balance-history" className="label !mb-0">
            Balance
            <span className="sr-only">
              {" "}
              of {name}, {period}, {dir === "unchanged" ? "unchanged" : `${dir} ${bareRM(formatRM(Math.abs(history.change)))} ringgit`}
            </span>
          </h2>
          <p className={`num text-[13px] font-extrabold ${history.end < 0 ? "text-danger" : ""}`}>
            {history.end < 0 ? "−" : ""}
            <Money sen={Math.abs(history.end)} />
          </p>
        </div>
        <div className="mt-1">
          <BalanceChart data={history.points} name={name} />
        </div>
        <p className="sub mt-1 flex justify-between gap-2">
          <span>
            Start <b className="num text-foreground">{bareRM(formatRM(history.start))}</b>
          </span>
          <span>
            Low <b className="num text-foreground">{bareRM(formatRM(low))}</b>
          </span>
          <span>
            High <b className="num text-foreground">{bareRM(formatRM(high))}</b>
          </span>
        </p>
        <ChartTable
          caption={`${name} balance at the end of each day shown`}
          columns={["Date", "Balance"]}
          rows={history.points.map((p) => [shortDate(p.date), formatRM(p.balance)])}
        />
        {note && <p className="sub mt-2">{note}</p>}
      </section>
      {statementHref && (
        <Link href={statementHref} className="btn w-full" prefetch={false}>
          <FileText size={14} strokeWidth={2.5} aria-hidden />
          Download statement
        </Link>
      )}
    </>
  );
}
