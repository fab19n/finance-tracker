import { Check } from "lucide-react";
import { DuoIcon, type DuoName } from "@/components/DuoIcon";
import { Money } from "@/components/Money";
import { cardLook, parseMark } from "@/lib/card";
import type { AccountBalance } from "@/lib/queries/accounts";
import { CardMark } from "./CardMark";

const KIND = { bank: "Bank", cash: "Cash", ewallet: "E-wallet", investment: "Investment" } as const;
const TYPE_ICON: Record<AccountBalance["type"], DuoName> = { bank: "bank", cash: "cash", ewallet: "ewallet", investment: "invest" };
const ROLE = { spending: "Main", savings: "Savings" } as const;
const ROLE_CAPTION = { spending: "Main account", savings: "Savings account" } as const;

/** The contactless waves of a payment card (the board's corner icon). Decorative. */
function Contactless({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden className={className}>
      <path d="M8.5 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M15.5 3.5a12 12 0 0 1 0 17" />
    </svg>
  );
}

/** "Main" / "Savings" with a check, a soft fill in the card's own text colour (so it works on any card colour). */
function RolePill({ purpose }: { purpose: NonNullable<AccountBalance["purpose"]> }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full py-0.5 pl-1.5 pr-2 text-[11px] font-extrabold" style={{ backgroundColor: "color-mix(in srgb, currentColor 14%, transparent)" }}>
      <Check size={11} strokeWidth={3.2} aria-hidden />
      {ROLE[purpose]}
    </span>
  );
}

export type CardSize = "lg" | "sm" | "wide";

/**
 * An account as a card, the way the Accounts board draws it. Three sizes: `lg` (140 px, the Main account and the card on
 * an account's page), `sm` (80 px: name and mark, then the balance; the grid of the other accounts) and `wide` (132 px, the
 * live preview in Card settings). The big ones read top, middle, bottom: the card type and the Main/Savings badge with the
 * contactless waves; the balance (ringgit large, cents dimmed); the name over its caption, and the last four digits over
 * the network mark (or a small icon for the account's type when there is no mark). Two soft shapes sit behind. The colour
 * is the bank's (or the owner's); an unknown bank stays plain, in the theme's own card colours, edged by a hairline rim.
 * It carries no link: the caller wraps it.
 */
export function AccountCard({ account: a, size = "lg" }: { account: AccountBalance; size?: CardSize }) {
  const look = cardLook(a);
  const mark = parseMark(a.cardNetwork);
  const plain = look.bg === null;
  const negative = a.balance < 0;
  const small = size === "sm";
  const frame = `relative flex flex-col justify-between overflow-hidden ${plain ? "border border-line bg-card-subtle text-foreground" : ""}`;
  const frameStyle = plain ? undefined : { backgroundColor: look.bg!, color: look.fg! };
  // The cents stay the card's own text colour: the page's muted grey would fail contrast on a coloured card.
  const money = `num figure leading-tight tracking-[-0.02em] [&_.dec]:text-current! ${negative && plain ? "text-danger" : ""}`;
  const typeIcon = <DuoIcon name={TYPE_ICON[a.type]} size={small ? 16 : 20} aria-hidden />;

  if (small) {
    return (
      <div className={`${frame} min-h-20 rounded-[18px] px-3 py-2.5 ${a.archived ? "opacity-80" : ""}`} style={frameStyle}>
        <span aria-hidden className="pointer-events-none absolute -right-5 -top-6 size-[70px] rounded-full bg-current opacity-10" />
        <div className="relative flex items-center justify-between gap-2 text-[12px] font-bold">
          <span className="min-w-0 truncate">{a.name}</span>
          {mark ? <CardMark mark={mark} compact className="shrink-0" /> : <span className="shrink-0">{typeIcon}</span>}
        </div>
        <p className={`relative flex items-baseline justify-between gap-2 ${money}`}>
          <span className="text-[15px]">
            {negative && !plain && <span className="sr-only">Overdrawn: </span>}
            <Money sen={a.balance} />
          </span>
          {a.archived && <span className="text-[11px] font-bold tracking-normal">Archived</span>}
        </p>
      </div>
    );
  }

  const wide = size === "wide";
  const caption = a.archived ? "Archived account" : a.purpose ? ROLE_CAPTION[a.purpose] : null;
  return (
    <div className={`${frame} ${wide ? "min-h-[132px] rounded-[20px] px-3.5 py-3" : "min-h-[140px] rounded-[22px] px-4 py-3.5"}`} style={frameStyle}>
      <span aria-hidden className="pointer-events-none absolute -right-11 -top-14 size-[150px] rounded-full bg-current opacity-10" />
      {!wide && <span aria-hidden className="pointer-events-none absolute -bottom-11 right-9 size-[92px] rounded-[26px] bg-current opacity-10" />}
      <span aria-hidden className={`pointer-events-none absolute rounded-[17px] border border-current opacity-25 ${wide ? "inset-1" : "inset-[5px]"}`} />
      <div className="relative flex items-center justify-between gap-2 text-[11.5px] font-bold">
        <span className="flex min-w-0 items-center gap-2">
          {KIND[a.type]}
          {a.purpose && <RolePill purpose={a.purpose} />}
        </span>
        {a.type !== "cash" && a.type !== "investment" && <Contactless className="shrink-0" />}
      </div>
      <p className={`relative ${money} ${wide ? "text-[22px]" : "text-[30px]"}`}>
        {negative && !plain && <span className="sr-only">Overdrawn: </span>}
        <Money sen={a.balance} />
      </p>
      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold">{a.name}</p>
          {caption && <p className="text-[11.5px] font-semibold">{caption}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {a.cardLast4 && <span className="num text-[11.5px] font-semibold">•••• {a.cardLast4}</span>}
          {mark ? <CardMark mark={mark} /> : typeIcon}
        </div>
      </div>
    </div>
  );
}
