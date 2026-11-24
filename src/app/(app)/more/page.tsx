import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { DuoIcon, type DuoName } from "@/components/DuoIcon";
import { KoopangLogo } from "@/components/KoopangLogo";
import { LockNowForm } from "@/components/offline/LockNowForm";
import { PageHeader } from "@/components/PageHeader";
import { pinEnabled } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { formatRMWhole } from "@/lib/money";
import { getMoreSummary, type MoreSummary } from "@/lib/queries/more-summary";

type Item = { href: string; label: string; hint: string; icon: DuoName; value?: { text: string; bad?: boolean } | null };

/** Everything that isn't on the tab bar. Each row is a link to its page; each of those pages has a back link here. */
function moneyItems(s: MoreSummary): Item[] {
  return [
    {
      href: "/plan",
      label: "Plan",
      hint: "Safe to spend, payday plan and bills",
      icon: "plan",
      value: s.leftToSpend === null ? null : s.leftToSpend >= 0 ? { text: `${formatRMWhole(s.leftToSpend)} left` } : { text: `${formatRMWhole(-s.leftToSpend)} short`, bad: true },
    },
    {
      href: "/plan/shared",
      label: "Shared bills",
      hint: "Who owes you, and for which month",
      icon: "shared",
      value: s.owedToYou === null ? null : s.owedToYou > 0 ? { text: `${formatRMWhole(s.owedToYou)} owed` } : { text: "Paid up" },
    },
    {
      href: "/insights",
      label: "Insights",
      hint: "Findings and what each is worth",
      icon: "insights",
      value: s.findings === null ? null : { text: s.findings === 0 ? "None" : `${s.findings} ${s.findings === 1 ? "finding" : "findings"}` },
    },
    { href: "/invest", label: "Invest", hint: "Holdings, growth and idle savings", icon: "invest", value: s.portfolio === null ? null : { text: formatRMWhole(s.portfolio) } },
  ];
}
const TOOLS: Item[] = [
  { href: "/import", label: "Import a statement", hint: "PDF or CSV from your bank", icon: "import" },
  { href: "/settings", label: "Settings", hint: "Payday, categories, theme and backup", icon: "settings" },
];

/** One row of a list: the round icon, the name and its hint, the live figure (when there is one) and the chevron. */
function Row({ href, label, hint, icon, value }: Item) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-3 py-2.5 transition hover:bg-card-subtle">
        <span className="disc">
          <DuoIcon name={icon} size={22} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold">{label}</span>
          <span className="sub block">{hint}</span>
        </span>
        {value && <span className={`num shrink-0 text-[11.5px] font-extrabold ${value.bad ? "text-danger" : "text-accent-strong"}`}>{value.text}</span>}
        <ChevronRight size={18} strokeWidth={2.4} className="shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
}

export const metadata = { title: "More" };

export default async function MorePage() {
  await connection();
  const summary = await getMoreSummary(todayISO());
  const locked = pinEnabled();
  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="More" />
      <section aria-labelledby="more-money" className="space-y-2">
        <h2 id="more-money" className="label px-1">
          Money
        </h2>
        <ul className="rows">
          {moneyItems(summary).map((i) => (
            <Row key={i.href} {...i} />
          ))}
        </ul>
      </section>
      <section aria-labelledby="more-tools" className="space-y-2">
        <h2 id="more-tools" className="label px-1">
          Tools
        </h2>
        <ul className="rows">
          {TOOLS.map((i) => (
            <Row key={i.href} {...i} />
          ))}
        </ul>
      </section>
      {locked && (
        <section className="card" aria-labelledby="more-lock">
          <h2 id="more-lock" className="h2">
            Lock now
          </h2>
          <p className="sub">Forgets saved pages on this phone</p>
          <LockNowForm />
        </section>
      )}
      <p className="flex items-center justify-center gap-2 pt-2 text-xs font-bold text-muted">
        <KoopangLogo height={16} /> <span>running on your PC</span>
      </p>
    </div>
  );
}
