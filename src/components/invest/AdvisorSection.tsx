import { AlertTriangle, CheckCircle2, Info, Lightbulb } from "lucide-react";
import Link from "next/link";
import { ChartTable } from "@/components/ChartTable";
import { ProjectionChart } from "@/components/charts/ProjectionChart";
import { Meter } from "@/components/Meter";
import type { Advice, AdviceStep } from "@/lib/investing/advisor";
import { formatRM, formatRMWhole } from "@/lib/money";
import type { AppSettings } from "@/lib/settings";

const TONE: Record<AdviceStep["tone"], { icon: typeof Info; ring: string; text: string }> = {
  warn: { icon: AlertTriangle, ring: "bg-warn-soft", text: "text-warn" },
  info: { icon: Info, ring: "bg-background", text: "text-muted" },
  go: { icon: CheckCircle2, ring: "bg-accent-soft", text: "text-accent" },
};

export function AdvisorSection({ advice, settings }: { advice: Advice; settings: AppSettings }) {
  const { emergency: ef, allocation: alloc, projection: proj } = advice;
  const efUsed = ef.target > 0 ? ef.have / ef.target : 1;

  return (
    <section className="space-y-4" aria-labelledby="advisor-h">
      <div>
        <h2 id="advisor-h" className="flex items-center gap-2 text-lg font-semibold">
          <Lightbulb size={20} className="text-accent" aria-hidden /> What should I do with extra money?
        </h2>
        <p className="text-sm text-muted">
          A step-by-step path built from your own numbers. Change the assumptions in{" "}
          <Link href="/settings" className="font-medium text-accent">
            Settings
          </Link>
          .
        </p>
      </div>

      {advice.ready && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card !p-3.5">
            <p className="text-xs font-medium text-muted">Monthly surplus</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${advice.surplus > 0 ? "" : "text-danger"}`}>
              {formatRM(advice.surplus)}
            </p>
            <p className="mt-1 text-xs text-muted">average income minus spending, recent complete months</p>
          </div>
          <div className="card !p-3.5">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-medium text-muted">Emergency fund</p>
              <p className="text-xs font-medium">
                {ef.monthsCovered.toFixed(1)} of {settings.emergencyMonths} months
              </p>
            </div>
            <div className="mt-3">
              <Meter used={efUsed} status={ef.funded ? "ok" : efUsed >= 0.5 ? "watch" : "over"} />
            </div>
            <p className="mt-2 text-xs font-medium">
              {ef.funded
                ? "Fully covered"
                : `${formatRM(ef.gap)} to go${ef.monthsToFill ? ` · about ${ef.monthsToFill} month${ef.monthsToFill === 1 ? "" : "s"} at your surplus` : ""}`}
            </p>
          </div>
        </div>
      )}

      <ol className="space-y-2">
        {advice.steps.map((s, i) => {
          const t = TONE[s.tone];
          const Icon = t.icon;
          return (
            <li key={s.id} className="card flex gap-3 !p-3.5">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full ${t.ring} ${t.text}`}>
                <Icon size={16} aria-hidden />
                <span className="sr-only">Step {i + 1}</span>
              </span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-muted">{s.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {alloc && proj && (
        <div className="card space-y-4">
          <div>
            <h3 className="font-semibold">Your suggested split</h3>
            <p className="text-xs text-muted">
              {ef.funded ? "Starting now" : `Once the emergency fund is full (in about ${ef.monthsToFill ?? "a few"} months)`}, per month
              {advice.lumpSum > 0 ? " plus the idle cash once" : ""}
            </p>
          </div>

          <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label={`${alloc.fdPct}% fixed deposit, ${alloc.spPct}% S&P 500`}>
            {alloc.fdPct > 0 && <div className="bg-series-1" style={{ flexGrow: alloc.fdPct, flexBasis: 0 }} />}
            {alloc.spPct > 0 && <div className="bg-series-3" style={{ flexGrow: alloc.spPct, flexBasis: 0 }} />}
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm bg-series-1" />
              <span>Fixed deposit / money-market ({alloc.fdPct}%)</span>
              <span className="num ml-auto font-semibold">{formatRM(alloc.monthlyFd)}/mo</span>
              {alloc.lumpFd > 0 && <span className="num text-xs text-muted">+ {formatRM(alloc.lumpFd)}</span>}
            </li>
            <li className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm bg-series-3" />
              <span>S&amp;P 500 index fund ({alloc.spPct}%)</span>
              <span className="num ml-auto font-semibold">{formatRM(alloc.monthlySp)}/mo</span>
              {alloc.lumpSp > 0 && <span className="num text-xs text-muted">+ {formatRM(alloc.lumpSp)}</span>}
            </li>
          </ul>

          <div>
            <h3 className="font-semibold">Where {proj.years} years could take it</h3>
            <p className="mb-2 text-xs text-muted">
              The same cash, three ways, at the expected rates (FD {proj.rates.fd}%, S&amp;P 500 {proj.rates.spExpected}% a year).
            </p>
            <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
              <li className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded" style={{ backgroundColor: "var(--series-gray)" }} /> Money you put in
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-series-1" /> All fixed deposit
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-series-3" /> All S&amp;P 500
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-series-2" /> Your mix
              </li>
            </ul>
            <ProjectionChart data={proj.series} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Projected value after {proj.years} years by scenario</caption>
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1.5 font-medium">After {proj.years} years</th>
                  <th className="py-1.5 text-right font-medium">All FD</th>
                  <th className="py-1.5 text-right font-medium">All S&amp;P 500</th>
                  <th className="py-1.5 text-right font-medium">Your mix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr className="text-muted">
                  <td className="py-2">You put in</td>
                  <td className="num py-2 text-right">{formatRMWhole(proj.final.contributed)}</td>
                  <td className="num py-2 text-right">{formatRMWhole(proj.final.contributed)}</td>
                  <td className="num py-2 text-right">{formatRMWhole(proj.final.contributed)}</td>
                </tr>
                <tr>
                  <td className="py-2">Cautious (S&amp;P at {proj.rates.spLow}%)</td>
                  <td className="num py-2 text-right">{formatRMWhole(proj.final.fd)}</td>
                  <td className="num py-2 text-right">{formatRMWhole(proj.final.spLow)}</td>
                  <td className="num py-2 text-right">{formatRMWhole(proj.final.mixLow)}</td>
                </tr>
                <tr className="font-semibold">
                  <td className="py-2">Expected (S&amp;P at {proj.rates.spExpected}%)</td>
                  <td className="num py-2 text-right">{formatRMWhole(proj.final.fd)}</td>
                  <td className="num py-2 text-right">{formatRMWhole(proj.final.spExpected)}</td>
                  <td className="num py-2 text-right">{formatRMWhole(proj.final.mixExpected)}</td>
                </tr>
                <tr>
                  <td className="py-2">Optimistic (S&amp;P at {proj.rates.spHigh}%)</td>
                  <td className="num py-2 text-right">{formatRMWhole(proj.final.fd)}</td>
                  <td className="num py-2 text-right">{formatRMWhole(proj.final.spHigh)}</td>
                  <td className="num py-2 text-right">{formatRMWhole(proj.final.mixHigh)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ChartTable
            caption="Projected growth by year"
            columns={["Year", "Put in", "All FD", "All S&P 500", "Your mix"]}
            rows={proj.series.map((p) => [p.year === 0 ? "Now" : `${p.year}y`, formatRMWhole(p.contributed), formatRMWhole(p.fd), formatRMWhole(p.sp), formatRMWhole(p.mix)])}
          />
        </div>
      )}

      <aside className="rounded-2xl border border-line bg-background p-4 text-xs text-muted" aria-label="Important notes">
        <p className="mb-1.5 font-semibold text-foreground">Please read</p>
        <ul className="list-disc space-y-1 pl-4">
          {advice.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </aside>
    </section>
  );
}
