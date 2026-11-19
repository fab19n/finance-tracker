import { AlertTriangle } from "lucide-react";
import { formatRM } from "@/lib/money";
import type { SafeToSpend } from "@/lib/plan/safe";

/**
 * The Plan page's hero when you look at ONE account that isn't the spending account (the spending account gets the real
 * "safe to spend" card, from the same maths): what is left in it after the bills it still has to pay this cycle. There is no
 * "a day for everyday things": that only makes sense for the account you live on. A negative figure turns the card to
 * solid danger, with the words as well as the colour.
 */
export function AccountOutlookCard({ safe, billCount }: { safe: SafeToSpend; billCount: number }) {
  const short = safe.safe < 0;
  const name = safe.accountName ?? "this account";
  return (
    <section className={short ? "hero-danger" : "hero"} aria-label={`${name} after its bills`}>
      <p className="flex items-center gap-1.5 text-xs font-extrabold">
        {short && <AlertTriangle size={14} aria-hidden />} Left in {name} after its bills
      </p>
      <p className="num mt-1.5 text-[44px] font-black leading-none tracking-[-0.03em]">
        {short ? "−" : ""}
        {formatRM(Math.abs(safe.safe))}
      </p>
      <p className="mt-2.5 text-[13px] font-extrabold">
        {short
          ? `The bills paid from ${name} need more than it holds.`
          : billCount === 0
            ? `No bills are paid from ${name}.`
            : safe.unpaidCount === 0
              ? `All ${billCount} of its bills are paid this cycle.`
              : `${safe.unpaidCount} of its ${billCount} bill${billCount === 1 ? "" : "s"} still to pay before payday.`}
      </p>
      {billCount > 0 && (
        <p className="mt-2.5 text-[11px] font-bold">
          {formatRM(safe.balance)} in {name} − {formatRM(safe.reserve)} held back for {safe.unpaidCount} unpaid bill{safe.unpaidCount === 1 ? "" : "s"}
          {safe.overdueCount > 0 && <span className="font-black"> ({safe.overdueCount} overdue)</span>}
        </p>
      )}
    </section>
  );
}
