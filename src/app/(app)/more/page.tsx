import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { DuoIcon, type DuoName } from "@/components/DuoIcon";
import { PageHeader } from "@/components/PageHeader";

type Item = { href: string; label: string; hint: string; icon: DuoName };

/** Everything that isn't on the tab bar. Each row is a link to its page; each of those pages has a back link here. */
const MONEY: Item[] = [
  { href: "/plan", label: "Plan", hint: "Left to spend, payday plan and bills", icon: "plan" },
  { href: "/plan/shared", label: "Shared bills", hint: "Who owes you, and for which month", icon: "shared" },
  { href: "/insights", label: "Insights", hint: "Where your money leaks, and what each leak is worth", icon: "insights" },
  { href: "/invest", label: "Invest", hint: "Holdings, growth and idle savings", icon: "invest" },
];
const TOOLS: Item[] = [
  { href: "/import", label: "Import a statement", hint: "A PDF or CSV from your bank", icon: "import" },
  { href: "/settings", label: "Settings", hint: "Categories, payday, investing, theme and backup", icon: "settings" },
];

function Row({ href, label, hint, icon }: Item) {
  return (
    <li>
      <Link href={href} className="flex min-h-16 items-center gap-3 rounded-[20px] bg-card px-3 py-2.5 transition hover:bg-card-subtle">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-card-subtle">
          <DuoIcon name={icon} size={22} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold">{label}</span>
          <span className="sub block">{hint}</span>
        </span>
        <ChevronRight size={18} strokeWidth={2.4} className="shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
}

export const metadata = { title: "More" };

export default function MorePage() {
  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="More" subtitle="Everything that isn't on the tab bar" />
      <section aria-labelledby="more-money" className="space-y-2">
        <h2 id="more-money" className="label px-1">
          Money
        </h2>
        <ul className="space-y-2">
          {MONEY.map((i) => (
            <Row key={i.href} {...i} />
          ))}
        </ul>
      </section>
      <section aria-labelledby="more-tools" className="space-y-2">
        <h2 id="more-tools" className="label px-1">
          Tools
        </h2>
        <ul className="space-y-2">
          {TOOLS.map((i) => (
            <Row key={i.href} {...i} />
          ))}
        </ul>
      </section>
    </div>
  );
}
