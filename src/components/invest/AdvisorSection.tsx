import { AlertTriangle, CheckCircle2, Info, Lightbulb } from "lucide-react";
import Link from "next/link";
import { ChartTable } from "@/components/ChartTable";
import { ProjectionChart } from "@/components/charts/ProjectionChart";
import { Meter } from "@/components/Meter";
import type { Advice, AdviceStep } from "@/lib/investing/advisor";
import { formatRM, formatRMWhole } from "@/lib/money";
import type { AppSettings } from "@/lib/settings";

// A step to take ("go") is good news; a warning is a warning; the rest is neutral information. The icon says which, too.
const TONE: Record<AdviceStep["tone"], { icon: typeof Info; ring: string; text: string }> = {
  warn: { icon: AlertTriangle, ring: "bg-warn-soft", text: "text-warn" },
  info: { icon: Info, ring: "bg-card-subtle", text: "text-muted" },
  go: { icon: CheckCircle2, ring: "bg-good-soft", text: "text-good" },
};

/**
 * The advisor. It sits in a half-width column on large screens, so the two-up tiles key off the section's own width
 * (a container query) rather than the screen's.
 */
export function AdvisorSection({ advice, settings }: { advice: Advice; settings: AppSettings }) {
  const { emergency: ef, allocation: alloc, projection: proj } = advice;
  const efUsed = ef.target > 0 ? ef.have / ef.target : 1;

  return (
    <section className="@container space-y-3" aria-labelledby="advisor-h">
      <div className="px-1">
        <h2 id="advisor-h" className="h2 flex items-center gap-2">
          <Lightbulb size={18} className="shrink-0 text-accent" aria-hidden /> What should I do with extra money?
        </h2>
        <p className="sub mt-0.5 leading-relaxed">
          A step-by-step path built from your own numbers. Change the assumptions in{" "}
          <Link href="/settings" className="font-extrabold text-accent-strong underline-offset-2 hover:underline">
            Settings
          </Link>
          .
        </p>
      </div>

      {advice.ready && (
        <div className="grid gap-3 @md:grid-cols-2">
          <div className="card">
            <p className="label !mb-0.5">Monthly surplus</p>
            <p className={`num text-2xl font-black tracking-[-0.02em] ${advice.surplus > 0 ? "" : "text-danger"}`}>{formatRM(advice.surplus)}</p>
            <p className="sub mt-1 leading-relaxed">average income minus spending, recent complete months</p>
          </div>
          <div className="card">
            <div className="flex items-baseline justify-between gap-3">
              <p className="label !mb-0">Emergency fund</p>
              <p className="text-xs font-extrabold">
                {ef.monthsCovered.toFixed(1)} of {settings.emergencyMonths} months
              </p>
            </div>
            <div className="mt-3">
              <Meter used={efUsed} status={ef.funded ? "ok" : efUsed >= 0.5 ? "watch" : "over"} />
            </div>
            <p className="mt-2 text-xs font-extrabold">
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
            <li key={s.id} className="flex gap-3 rounded-2xl bg-card p-3.5">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full ${t.ring} ${t.text}`}>
                <Icon size={16} aria-hidden />
                <span className="sr-only">Step {i + 1}</span>
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-black">{s.title}</p>
                <p className="sub mt-0.5 leading-relaxed">{s.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {alloc && proj && (
        <div className="card space-y-4">
          <div>
            <h3 className="h2">Your suggested split</h3>
            <p className="sub mt-0.5">
              {ef.funded ? "Starting now" : `Once the emergency fund is full (in about ${ef.monthsToFill ?? "a few"} months)`}, per month
              {advice.lumpSum > 0 ? " plus the idle cash once" : ""}
            </p>
          </div>

          {/* Fixed deposit is slot 1 and S&P 500 slot 2 here, as in every investment chart. */}
          <div className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${alloc.fdPct}% fixed deposit, ${alloc.spPct}% S&P 500`}>
            {alloc.fdPct > 0 && <div className="bg-series-1" style={{ flexGrow: alloc.fdPct, flexBasis: 0 }} />}
            {alloc.spPct > 0 && <div className="bg-series-2" style={{ flexGrow: alloc.spPct, flexBasis: 0 }} />}
          </div>
          <ul className="space-y-2.5 text-xs font-bold">
            <li className="flex items-start gap-2">
              <span className="mt-1 size-2.5 shrink-0 rounded-full bg-series-1" aria-hidden />
              <span className="min-w-0 flex-1">Fixed deposit / money-market ({alloc.fdPct}%)</span>
              <span className="shrink-0 text-right">
                <span className="num block font-black">{formatRM(alloc.monthlyFd)}/mo</span>
                {alloc.lumpFd > 0 && <span className="num block text-[11px] text-muted">+ {formatRM(alloc.lumpFd)}</span>}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-2.5 shrink-0 rounded-full bg-series-2" aria-hidden />
              <span className="min-w-0 flex-1">S&amp;P 500 index fund ({alloc.spPct}%)</span>
              <span className="shrink-0 text-right">
                <span className="num block font-black">{formatRM(alloc.monthlySp)}/mo</span>
                {alloc.lumpSp > 0 && <span className="num block text-[11px] text-muted">+ {formatRM(alloc.lumpSp)}</span>}
              </span>
            </li>
          </ul>

          <div>
            <h3 className="h2">Where {proj.years} years could take it</h3>
            <p className="sub mb-2.5 mt-0.5 leading-relaxed">
              The same cash, three ways, at the expected rates (FD {proj.rates.fd}%, S&amp;P 500 {proj.rates.spExpected}% a year).
            </p>
            <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Legend">
              <li className="pill bg-card-subtle">
                <span className="w-4 border-t-2 border-dotted border-ink-muted" aria-hidden /> Money you put in
              </li>
              <li className="pill bg-card-subtle">
                <span className="h-[3px] w-4 rounded bg-series-1" aria-hidden /> All fixed deposit
              </li>
              <li className="pill bg-card-subtle">
                <span className="h-[3px] w-4 rounded bg-series-2" aria-hidden /> All S&amp;P 500
              </li>
              <li className="pill bg-card-subtle">
                <span className="h-[3px] w-4 rounded bg-series-3" aria-hidden /> Your mix
              </li>
            </ul>
            <ProjectionChart data={proj.series} />
          </div>

          <div className="overflow-x-auto rounded-2xl bg-card-subtle px-3 py-1">
            <table className="w-full text-left text-xs md:text-[13px]">
              <caption className="sr-only">Projected value after {proj.years} years by scenario</caption>
              <thead className="text-[11px] text-muted">
                <tr>
                  <th className="py-2 font-extrabold">After {proj.years} years</th>
                  <th className="py-2 pl-2 text-right font-extrabold">All FD</th>
                  <th className="py-2 pl-2 text-right font-extrabold">All S&amp;P 500</th>
                  <th className="py-2 pl-2 text-right font-extrabold">Your mix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr className="font-bold text-muted">
                  <td className="py-2">You put in</td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right">{formatRMWhole(proj.final.contributed)}</td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right">{formatRMWhole(proj.final.contributed)}</td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right">{formatRMWhole(proj.final.contributed)}</td>
                </tr>
                <tr className="font-bold">
                  <td className="py-2">Cautious (S&amp;P at {proj.rates.spLow}%)</td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right">{formatRMWhole(proj.final.fd)}</td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right">{formatRMWhole(proj.final.spLow)}</td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right">{formatRMWhole(proj.final.mixLow)}</td>
                </tr>
                <tr className="font-black">
                  <td className="py-2">Expected (S&amp;P at {proj.rates.spExpected}%)</td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right">{formatRMWhole(proj.final.fd)}</td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right">{formatRMWhole(proj.final.spExpected)}</td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right">{formatRMWhole(proj.final.mixExpected)}</td>
                </tr>
                <tr className="font-bold">
                  <td className="py-2">Optimistic (S&amp;P at {proj.rates.spHigh}%)</td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right">{formatRMWhole(proj.final.fd)}</td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right">{formatRMWhole(proj.final.spHigh)}</td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right">{formatRMWhole(proj.final.mixHigh)}</td>
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

      <aside className="card !p-4 text-xs font-bold text-muted" aria-label="Important notes">
        <p className="mb-1.5 font-extrabold text-foreground">Please read</p>
        <ul className="list-disc space-y-1 pl-4 leading-relaxed">
          {advice.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </aside>
    </section>
  );
}
