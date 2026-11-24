import type { CardMark as Mark } from "@/lib/card";

/**
 * The small mark in a card's corner. Simple wordmarks drawn here (not the networks' official artwork, which is theirs
 * to license): readable at 20 px, in the card's own text colour so they pass contrast on any card colour. Mastercard
 * keeps its two circles, which are two flat colours with a multiply overlap.
 */
export function CardMark({ mark, className = "", compact = false }: { mark: Mark; className?: string; /** On a small card the wide marks are shortened (Touch 'n Go to TnG, a typed name to 5 rem). */ compact?: boolean }) {
  if (!mark) return null;
  const cls = `h-6 w-auto ${className}`;
  if (mark.kind === "other") {
    // The board draws an unknown mark as a small filled badge, in the card's own text colour at a low tint.
    return (
      <span
        className={`truncate rounded-full px-2 py-0.5 text-[11px] font-extrabold tracking-wide ${compact ? "max-w-[5rem]" : "max-w-[8rem]"} ${className}`}
        style={{ backgroundColor: "color-mix(in srgb, currentColor 14%, transparent)" }}
      >
        {mark.name}
      </span>
    );
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
          {compact ? "TnG" : "Touch 'n Go"}
        </span>
      );
  }
}
