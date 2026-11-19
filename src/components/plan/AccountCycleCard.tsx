import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { formatRMWhole } from "@/lib/money";

/**
 * What one account did in the pay cycle on screen: money in, spending, and what moved in and out by transfer (transfers are
 * neither income nor spending, so they are their own pair). Opening balance + all of this = the balance, which is how the
 * account's chip ties out. The link opens the entries behind these figures, for exactly this cycle.
 */
export function AccountCycleCard({
  name,
  period,
  figures,
  href,
}: {
  name: string;
  period: string;
  figures: { income: number; spent: number; movedIn: number; movedOut: number };
  href: string;
}) {
  const items: { label: string; value: number; tone?: string }[] = [
    { label: "Money in", value: figures.income, tone: "text-good" },
    { label: "Spent", value: figures.spent },
    { label: "Moved in", value: figures.movedIn },
    { label: "Moved out", value: figures.movedOut },
  ];
  return (
    <section className="card" aria-labelledby="cycle-in-account">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="cycle-in-account" className="h2">
          This cycle in {name}
        </h2>
        <span className="sub">{period}</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {items.map((i) => (
          <div key={i.label} className="rounded-2xl bg-card-subtle px-3 py-2.5">
            <dt className="text-[11px] font-extrabold text-muted">{i.label}</dt>
            <dd className={`num text-sm font-black md:text-base ${i.tone ?? ""}`}>{formatRMWhole(i.value)}</dd>
          </div>
        ))}
      </dl>
      <Link href={href} className="mt-3 inline-flex min-h-8 items-center gap-1 text-xs font-extrabold text-accent-strong hover:underline">
        See its entries this cycle <ArrowRight size={14} aria-hidden />
      </Link>
    </section>
  );
}
