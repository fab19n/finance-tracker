import { ChevronDown } from "lucide-react";
import { recordSharePayment, unassignPayment } from "@/app/actions/shares";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { shortDate } from "@/lib/dates";
import { formatRM, senToInput } from "@/lib/money";
import type { CountedPayment } from "@/lib/queries/shares";

/** What the person controls below need: where a payment can go, the counted payments by person, and today's date. */
export type PayContext = {
  accounts: { id: number; name: string }[];
  defaultAccountId: number | null;
  payments: Record<number, CountedPayment[]>;
  today: string;
};

/**
 * "Mark paid": this person paid. A small form (amount, date, which account it went into) that records the money in and
 * counts it towards them in one step, so there is no need to add it by hand and then claim it. `amount` is prefilled with
 * what is missing (a month's remainder, what they owe now, or a turn's cost).
 */
export function MarkPaid({
  shareId,
  name,
  amount,
  pay,
  label = "Mark paid",
  note,
}: {
  shareId: number;
  name: string;
  amount: number;
  pay: PayContext;
  label?: string;
  /** A line under the fields: what the payment will settle. */
  note?: string;
}) {
  if (pay.accounts.length === 0) return null;
  const f = `pay-${shareId}-${label.replace(/\W+/g, "")}-${amount}`;
  return (
    <details className="group">
      <summary className="btn btn-sm inline-flex min-h-11 cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden" aria-label={`${label}: ${name}${amount > 0 ? `, ${formatRM(amount)}` : ""}`}>
        {label}
        <ChevronDown size={14} strokeWidth={2.5} className="transition group-open:rotate-180" aria-hidden />
      </summary>
      <ActionForm action={recordSharePayment} className="mt-2 grid grid-cols-2 gap-2.5 rounded-2xl bg-card p-3">
        <input type="hidden" name="shareId" value={shareId} />
        <div className="min-w-0">
          <label className="label" htmlFor={`${f}-amount`}>
            Amount (RM)
          </label>
          <input id={`${f}-amount`} name="amount" inputMode="decimal" defaultValue={amount > 0 ? senToInput(amount) : ""} required className="input" autoComplete="off" />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor={`${f}-date`}>
            Date
          </label>
          <input id={`${f}-date`} name="date" type="date" defaultValue={pay.today} required className="input" />
        </div>
        <div className="col-span-2 min-w-0">
          <label className="label" htmlFor={`${f}-account`}>
            Into
          </label>
          <select id={`${f}-account`} name="accountId" defaultValue={pay.defaultAccountId ?? undefined} required className="input">
            {pay.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <p className="sub col-span-2 leading-relaxed">{note ?? `Adds the money to that account as ${name}'s payment and settles their oldest unpaid months first.`}</p>
        <SubmitButton className="btn-primary col-span-2 w-full md:w-auto" pendingLabel="Saving...">
          Save payment
        </SubmitButton>
      </ActionForm>
    </details>
  );
}

const PAYMENTS_SHOWN = 4;

/** The payments counted towards a person, newest first, each with "Not theirs" (it stays recorded as money in). */
export function CountedPayments({ name, payments }: { name: string; payments: CountedPayment[] }) {
  if (payments.length === 0) return null;
  const row = (c: CountedPayment) => (
    <li key={c.txId} className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="num font-extrabold">{formatRM(c.amount)}</span>
        <span className="font-bold text-muted"> · {shortDate(c.date)}</span>
      </span>
      <ActionForm action={unassignPayment}>
        <input type="hidden" name="txId" value={c.txId} />
        <SubmitButton className="btn btn-sm min-h-11" pendingLabel="Undoing..." aria-label={`Not theirs: ${formatRM(c.amount)} on ${c.date} was not from ${name}`}>
          Not theirs
        </SubmitButton>
      </ActionForm>
    </li>
  );
  return (
    <div>
      <h4 className="mb-0.5 text-xs font-extrabold">Payments counted from {name}</h4>
      <ul className="divide-y divide-line text-xs">{payments.slice(0, PAYMENTS_SHOWN).map(row)}</ul>
      {payments.length > PAYMENTS_SHOWN && (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-xs font-extrabold text-accent-strong [&::-webkit-details-marker]:hidden">
            Show {payments.length - PAYMENTS_SHOWN} earlier
            <ChevronDown size={14} strokeWidth={2.5} className="transition group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="divide-y divide-line text-xs">{payments.slice(PAYMENTS_SHOWN).map(row)}</ul>
        </details>
      )}
      <p className="sub mt-0.5">&ldquo;Not theirs&rdquo; takes it off their months; the money stays in your records.</p>
    </div>
  );
}
