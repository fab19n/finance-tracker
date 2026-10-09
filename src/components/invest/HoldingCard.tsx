import { ArrowDownRight, ArrowUpRight, CalendarClock, Minus } from "lucide-react";
import { archiveInvestment, recordInvestmentFlow, recordValuation, updateHolding } from "@/app/actions/investments";
import { dayLabel } from "@/lib/dates";
import { formatPct, formatRM } from "@/lib/money";
import type { InvestmentRow } from "@/lib/queries/investments";

const PRODUCT_LABEL: Record<string, string> = {
  sp500_etf: "S&P 500",
  fixed_deposit: "Fixed deposit",
  asb: "ASB / unit trust",
  other: "Investment",
};

type Funding = { id: number; name: string }[];

function Gain({ gain, pct }: { gain: number; pct: number | null }) {
  const up = gain > 0;
  const down = gain < 0;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${up ? "text-income" : down ? "text-danger" : "text-muted"}`}>
      <Icon size={15} aria-hidden />
      {up ? "+" : down ? "−" : ""}
      {formatRM(Math.abs(gain))}
      {pct !== null && <span className="ml-1 font-medium">({up ? "+" : down ? "−" : ""}{formatPct(Math.abs(pct), 1)})</span>}
    </span>
  );
}

export function HoldingCard({ row, funding, today }: { row: InvestmentRow; funding: Funding; today: string }) {
  const { account, holding, fd } = row;
  const product = holding?.product ?? "other";
  const isFd = product === "fixed_deposit";

  return (
    <article className="card space-y-3" aria-label={account.name}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{account.name}</h3>
          <span className="pill bg-background text-muted">{PRODUCT_LABEL[product]}</span>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold tracking-tight">{formatRM(row.value)}</p>
          <p className="text-xs text-muted">worth today</p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">You put in</dt>
          <dd className="num font-medium">{formatRM(row.invested)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Growth</dt>
          <dd className="num">
            <Gain gain={row.gain} pct={row.gainPct} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Yearly return (XIRR)</dt>
          <dd className="num font-medium">
            {row.xirr !== null ? (
              <>
                {(row.xirr * 100).toFixed(1)}% p.a.
                {row.spanDays < 365 && (
                  <span className="block text-xs font-normal text-muted" title="Annualising a short history exaggerates swings - treat it as a rough guide">
                    short history ({Math.round(row.spanDays / 30)} mo)
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted">needs 3+ months</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{isFd ? "Interest rate" : "Last updated"}</dt>
          <dd className="font-medium">{isFd && fd ? `${fd.ratePct}% p.a.` : row.lastValuedOn ? dayLabel(row.lastValuedOn) : <span className="text-muted">never</span>}</dd>
        </div>
      </dl>

      {isFd && fd && (
        <p className="flex items-center gap-2 rounded-xl bg-background px-3 py-2 text-sm">
          <CalendarClock size={16} className="shrink-0 text-muted" aria-hidden />
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
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          No value recorded yet, so growth shows as zero. Use &quot;Update value&quot; below
          {holding?.ticker && holding.units ? " or Refresh prices at the top" : ""}.
        </p>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-accent">Update, add money or take money out</summary>
        <div className="mt-3 space-y-4">
          {!isFd && (
            <form action={recordValuation} className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="accountId" value={account.id} />
              <div>
                <label className="label">Worth now (RM)</label>
                <input name="value" inputMode="decimal" placeholder="0.00" required className="input" />
              </div>
              <div>
                <label className="label">As of</label>
                <input name="date" type="date" defaultValue={today} required className="input" />
              </div>
              <button className="btn-primary self-end !py-2.5 text-sm">Update value</button>
            </form>
          )}

          {(["in", "out"] as const).map((direction) => (
            <form key={direction} action={recordInvestmentFlow} className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
              <input type="hidden" name="accountId" value={account.id} />
              <input type="hidden" name="direction" value={direction} />
              <div>
                <label className="label">{direction === "in" ? "Add money (RM)" : "Take out (RM)"}</label>
                <input name="amount" inputMode="decimal" placeholder="0.00" required className="input" />
              </div>
              <div>
                <label className="label">{direction === "in" ? "From" : "Into"}</label>
                <select name="fromAccountId" className="input">
                  {funding.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Date</label>
                <input name="date" type="date" defaultValue={today} required className="input" />
              </div>
              <button className="btn self-end !py-2.5 text-sm">{direction === "in" ? "Add money" : "Take out"}</button>
            </form>
          ))}

          {!isFd && (
            <form action={updateHolding} className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
              <input type="hidden" name="accountId" value={account.id} />
              <div>
                <label className="label">Ticker</label>
                <input name="ticker" defaultValue={holding?.ticker ?? ""} placeholder="VOO" className="input" />
              </div>
              <div>
                <label className="label">Units held</label>
                <input name="units" type="number" step="any" min="0" defaultValue={holding?.units ?? ""} className="input" />
              </div>
              <div>
                <label className="label">Quoted in</label>
                <select name="priceCurrency" defaultValue={holding?.priceCurrency ?? "USD"} className="input">
                  {["USD", "GBP", "EUR", "MYR", "SGD"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <button className="btn self-end !py-2.5 text-sm">Save price tracking</button>
            </form>
          )}

          <form action={archiveInvestment}>
            <input type="hidden" name="accountId" value={account.id} />
            <button className="btn-danger">Archive this investment</button>
          </form>
        </div>
      </details>
    </article>
  );
}
