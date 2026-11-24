import { cardLook, parseMark } from "@/lib/card";
import { formatRM } from "@/lib/money";
import type { AccountBalance } from "@/lib/queries/accounts";
import { CardMark } from "./CardMark";

const KIND = { bank: "Bank", cash: "Cash", ewallet: "E-wallet", investment: "Investment" } as const;

/**
 * An account as a card: name and mark on top, the balance below, a Main or Savings tag. The colour is the bank's (or
 * the owner's); an unknown bank stays plain, in the theme's own card colours. A coin rim (an inset hairline) edges it.
 * It carries no link: the caller wraps it, so the same card tops the account's page.
 */
export function AccountCard({ account: a }: { account: AccountBalance }) {
  const look = cardLook(a);
  const mark = parseMark(a.cardNetwork);
  const plain = look.bg === null;
  const negative = a.balance < 0;
  return (
    <div
      className={`relative flex min-h-40 flex-col justify-between overflow-hidden rounded-[24px] p-4 ${plain ? "border border-line bg-card-subtle text-foreground" : ""}`}
      style={plain ? undefined : { backgroundColor: look.bg!, color: look.fg! }}
    >
      <span aria-hidden className={`pointer-events-none absolute inset-[5px] rounded-[19px] border ${plain ? "border-line" : "border-current opacity-25"}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold">{a.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-bold">
            {KIND[a.type]}
            {a.cardLast4 && <span className="num">•••• {a.cardLast4}</span>}
          </p>
        </div>
        <CardMark mark={mark} className="shrink-0" />
      </div>
      <div className="relative flex items-end justify-between gap-3">
        <p className={`num figure text-[26px] leading-tight tracking-[-0.02em] ${negative && plain ? "text-danger" : ""}`}>
          {negative && !plain && <span className="sr-only">Overdrawn: </span>}
          {formatRM(a.balance)}
        </p>
        {a.purpose === "spending" && <span className="pill shrink-0 border border-current bg-transparent py-0.5 font-extrabold">Main</span>}
        {a.purpose === "savings" && <span className="pill shrink-0 border border-current bg-transparent py-0.5 font-extrabold">Savings</span>}
      </div>
    </div>
  );
}
