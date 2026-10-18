import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, Minus } from "lucide-react";
import { dayLabel } from "@/lib/dates";
import { formatPct, formatRM } from "@/lib/money";
import type { InvestmentRow } from "@/lib/queries/investments";
import { HoldingActions } from "./HoldingActions";

const PRODUCT_LABEL: Record<string, string> = {
  sp500_etf: "S&P 500",
  fixed_deposit: "Fixed deposit",
  asb: "ASB / unit trust",
  other: "Investment",
};

type Funding = { id: number; name: string }[];

/** Growth in ringgit and percent. The arrow and the sign carry the direction, so it is never colour alone. */
function Gain({ gain, pct }: { gain: number; pct: number | null }) {
  const up = gain > 0;
  const down = gain < 0;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-extrabold ${up ? "text-good" : down ? "text-danger" : "text-muted"}`}>
      <Icon size={14} aria-hidden />
      <span className="sr-only">Growth </span>
      {up ? "+" : down ? "−" : ""}
      {formatRM(Math.abs(gain))}
      {pct !== null && (
        <span className="ml-1 font-bold">
          ({up ? "+" : down ? "−" : ""}
          {formatPct(Math.abs(pct), 1)})
        </span>
      )}
    </span>
  );
}

export function HoldingCard({ row, funding, today }: { row: InvestmentRow; funding: Funding; today: string }) {
  const { account, holding, fd } = row;
  const product = holding?.product ?? "other";
  const isFd = product === "fixed_deposit";
  // A deposit that has matured, or matures within a month, wants a decision: that is a warning, not just a date.
  const fdAttention = isFd && fd ? fd.matured || fd.daysToMaturity <= 30 : false;

  return (
    <article className="card space-y-3" aria-label={account.name}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black">{account.name}</h3>
          <p className="sub !text-[11px]">{PRODUCT_LABEL[product]}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num whitespace-nowrap text-lg font-black">{formatRM(row.value)}</p>
          <p className="text-[11px] font-bold text-muted">worth today</p>
          <Gain gain={row.gain} pct={row.gainPct} />
        </div>
      </header>

      <dl className="space-y-1.5 rounded-2xl bg-card-subtle p-3 text-[13px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-xs font-extrabold text-muted">You put in</dt>
          <dd className="num font-black">{formatRM(row.invested)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-xs font-extrabold text-muted">Yearly return (XIRR)</dt>
          <dd className="num text-right font-black">
            {row.xirr !== null ? (
              <>
                {(row.xirr * 100).toFixed(1)}% p.a.
                {row.spanDays < 365 && (
                  <span className="block text-[11px] font-bold text-muted" title="Annualising a short history exaggerates swings - treat it as a rough guide">
                    short history ({Math.round(row.spanDays / 30)} mo)
                  </span>
                )}
              </>
            ) : (
              <span className="font-bold text-muted">needs 3+ months</span>
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-xs font-extrabold text-muted">{isFd ? "Interest rate" : "Last updated"}</dt>
          <dd className="font-black">{isFd && fd ? `${fd.ratePct}% p.a.` : row.lastValuedOn ? dayLabel(row.lastValuedOn) : <span className="font-bold text-muted">never</span>}</dd>
        </div>
      </dl>

      {isFd && fd && (
        <p className={`banner !text-xs ${fdAttention ? "banner-warn" : "bg-card-subtle text-foreground"}`}>
          <CalendarClock size={16} className={`mt-0.5 shrink-0 ${fdAttention ? "" : "text-muted"}`} aria-hidden />
          {fd.matured ? (
            <span>
              Matured on {dayLabel(fd.maturityDate)}: <strong>{formatRM(fd.maturityValue)}</strong> is ready to withdraw or roll over.
            </span>
          ) : (
            <span>
              Matures {dayLabel(fd.maturityDate)} ({fd.daysToMaturity} days) at <strong>{formatRM(fd.maturityValue)}</strong>.
              {fd.daysToMaturity <= 30 && " Decide now whether to roll it over."}
            </span>
          )}
        </p>
      )}

      {!isFd && !row.lastValuedOn && (
        <p className="banner banner-warn !text-xs">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            No value recorded yet, so growth shows as zero. Use &quot;Update value&quot; below
            {holding?.ticker && holding.units ? " or Refresh prices at the top" : ""}.
          </span>
        </p>
      )}

      <HoldingActions
        accountId={account.id}
        isFd={isFd}
        funding={funding}
        today={today}
        ticker={holding?.ticker ?? null}
        units={holding?.units ?? null}
        priceCurrency={holding?.priceCurrency ?? "USD"}
      />
    </article>
  );
}
