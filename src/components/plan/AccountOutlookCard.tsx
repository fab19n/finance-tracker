import { DuoIcon } from "@/components/DuoIcon";
import { Money } from "@/components/Money";
import { formatRM } from "@/lib/money";
import type { SafeToSpend } from "@/lib/plan/safe";

/**
 * The Plan page's lead card when you look at ONE account that isn't the spending account (the spending account gets the real
 * "safe to spend" card, from the same maths): what is left in it after the bills it still has to pay this cycle, as the
 * board draws it: a plain card, the label, a 30 px figure and one line. There is no "a day for everyday things": that only
 * makes sense for the account you live on. A negative figure turns danger, with the words and an icon as well as the colour.
 */
export function AccountOutlookCard({ safe, billCount }: { safe: SafeToSpend; billCount: number }) {
  const short = safe.safe < 0;
  const name = safe.accountName ?? "this account";
  return (
    <section className="card" aria-label={`${name} after its bills`}>
      <p className="label flex items-center gap-1.5">
        {short && <DuoIcon name="alert" size={14} className="text-danger" aria-hidden />} Left in {name} after its bills
      </p>
      <p className={`num font-display text-[30px] font-bold leading-none tracking-[-0.02em] ${short ? "text-danger" : ""}`}>
        {short && <span aria-hidden>−</span>}
        {short && <span className="sr-only">minus </span>}
        <Money sen={Math.abs(safe.safe)} />
      </p>
      <p className="sub mt-2.5">
        {short
          ? `The bills paid from ${name} need more than it holds.`
          : billCount === 0
            ? `No bills are paid from ${name}.`
            : safe.unpaidCount === 0
              ? `All ${billCount} of its bills are paid this cycle.`
              : `${safe.unpaidCount} of its ${billCount} bill${billCount === 1 ? "" : "s"} still to pay before payday.`}
      </p>
      {billCount > 0 && (
        <p className="sub mt-1">
          {formatRM(safe.balance)} in {name} − {formatRM(safe.reserve)} held back for {safe.unpaidCount} unpaid bill{safe.unpaidCount === 1 ? "" : "s"}
          {safe.overdueCount > 0 && <span className="font-extrabold text-danger"> ({safe.overdueCount} overdue)</span>}
        </p>
      )}
    </section>
  );
}
