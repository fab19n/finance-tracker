import Link from "next/link";
import { DuoIcon } from "@/components/DuoIcon";
import { Money } from "@/components/Money";

/**
 * What one account did in the pay cycle on screen: money in, spending, and what moved in and out by transfer (transfers are
 * neither income nor spending, so they are their own pair). Opening balance + all of this = the balance, which is how the
 * account's chip ties out. Drawn as the board's statement card: label and period, four rows, then a full-width button to
 * the entries behind these figures, for exactly this cycle.
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
    { label: "Moved in", value: figures.movedIn, tone: "text-good" },
    { label: "Moved out", value: figures.movedOut },
  ];
  return (
    <section className="card space-y-3" aria-labelledby="cycle-in-account">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="cycle-in-account" className="label !mb-0">
          This cycle in {name}
        </h2>
        <span className="sub">{period}</span>
      </div>
      <dl className="divide-y divide-line">
        {items.map((i) => (
          <div key={i.label} className="flex min-h-11 items-center justify-between gap-3 py-1.5 text-[13.5px] font-semibold">
            <dt className="text-muted">{i.label}</dt>
            <dd className={`num font-bold ${i.tone ?? ""}`}>
              <Money sen={i.value} />
            </dd>
          </div>
        ))}
      </dl>
      <Link href={href} className="btn w-full">
        <DuoIcon name="activity" size={18} aria-hidden /> See these entries
      </Link>
    </section>
  );
}
