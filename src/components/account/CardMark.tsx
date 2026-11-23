import type { CardMark as Mark } from "@/lib/card";

/**
 * The small mark in a card's corner. Simple wordmarks drawn here (not the networks' official artwork, which is theirs
 * to license): readable at 20 px, in the card's own text colour so they pass contrast on any card colour. Mastercard
 * keeps its two circles, which are two flat colours with a multiply overlap.
 */
export function CardMark({ mark, className = "" }: { mark: Mark; className?: string }) {
  if (!mark) return null;
  const cls = `h-6 w-auto ${className}`;
  if (mark.kind === "other") {
    return <span className={`max-w-[7rem] truncate text-xs font-extrabold tracking-wide ${className}`}>{mark.name}</span>;
  }
  switch (mark.key) {
    case "mastercard":
      return (
        <svg viewBox="0 0 40 24" className={cls} role="img" aria-label="Mastercard">
          <circle cx="14" cy="12" r="10" fill="#eb001b" />
          <circle cx="26" cy="12" r="10" fill="#f79e1b" fillOpacity="0.92" />
        </svg>
      );
    case "visa":
      return (
        <span className={`text-lg font-extrabold italic tracking-tight ${className}`} role="img" aria-label="Visa">
          VISA
        </span>
      );
    case "amex":
      return (
        <span className={`rounded-md border-2 border-current px-1.5 text-[11px] font-black leading-5 tracking-wider ${className}`} role="img" aria-label="American Express">
          AMEX
        </span>
      );
    case "unionpay":
      return (
        <span className={`text-sm font-extrabold tracking-tight ${className}`} role="img" aria-label="UnionPay">
          UnionPay
        </span>
      );
    case "mydebit":
      return (
        <span className={`text-sm font-extrabold ${className}`} role="img" aria-label="MyDebit">
          my<span className="font-black">Debit</span>
        </span>
      );
    case "tng":
      return (
        <span className={`rounded-full border-2 border-current px-2 text-[11px] font-black leading-5 ${className}`} role="img" aria-label="Touch 'n Go">
          Touch &apos;n Go
        </span>
      );
  }
}
