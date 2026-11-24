import { deleteBill, saveBill } from "@/app/actions/plan";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { SubmitButton } from "@/components/SubmitButton";
import { Toggle } from "@/components/Toggle";
import { FrequencyFields } from "@/components/plan/FrequencyFields";
import { senToInput } from "@/lib/money";
import { deleteBillBody, NO_USAGE, type BillUsage } from "@/lib/plan/bill-delete";
import type { BillRow } from "@/lib/queries/plan";

type Option = { id: number; name: string; icon?: string };

/** Add / edit form for one recurring bill: plain fields posting to the action, each with its own label. */
export function BillForm({
  bill,
  categories,
  accounts,
  defaultAccountId,
  returnAccount,
  usage = NO_USAGE,
  prefill,
}: {
  bill?: BillRow;
  categories: Option[];
  accounts: Option[];
  /** For a NEW bill: which account "Paid from" starts on (the account the Bills page is filtered to). */
  defaultAccountId?: number;
  /** The Plan's one-account filter to come back to after Save or Delete. */
  returnAccount?: number;
  /** For an existing bill: what deleting it would take with it (counted by the page), so the confirmation can say so. */
  usage?: BillUsage;
  /** For a NEW bill: a name and amount to start from ("Add as bill" on Insights). */
  prefill?: { name: string; amount: string };
}) {
  const fixed = bill ? bill.amountMin === bill.amountMax : true;
  const f = `bill-${bill?.id ?? "new"}`;
  return (
    <div className="space-y-2">
      <ActionForm action={saveBill} className="grid grid-cols-2 gap-2.5 md:grid-cols-6">
        {bill && <input type="hidden" name="id" value={bill.id} />}
        {returnAccount && <input type="hidden" name="account" value={returnAccount} />}
        <div className="col-span-2 min-w-0 md:col-span-2">
          <label className="label" htmlFor={`${f}-name`}>
            Bill name
          </label>
          <input id={`${f}-name`} name="name" defaultValue={bill?.name ?? prefill?.name} placeholder="e.g. Netflix" required className="input" />
        </div>
        <div className="col-span-2 min-w-0 md:col-span-2">
          <label className="label" htmlFor={`${f}-category`}>
            Category
          </label>
          <select id={`${f}-category`} name="categoryId" defaultValue={bill?.categoryId ?? ""} required className="input">
            <option value="" disabled>
              Choose…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 min-w-0 md:col-span-2">
          <label className="label" htmlFor={`${f}-account`}>
            Paid from
          </label>
          <select id={`${f}-account`} name="accountId" defaultValue={bill?.accountId ?? defaultAccountId} required className="input">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor={`${f}-amount`}>
            Amount (RM)
          </label>
          <input id={`${f}-amount`} name="amountMin" defaultValue={bill ? senToInput(bill.amountMin) : (prefill?.amount ?? "")} placeholder="88.90" inputMode="decimal" required className="input" />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor={`${f}-max`}>
            Up to (if it varies)
          </label>
          <input id={`${f}-max`} name="amountMax" defaultValue={bill && !fixed ? senToInput(bill.amountMax) : ""} placeholder="optional" inputMode="decimal" className="input" />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor={`${f}-due`}>
            Due day of month
          </label>
          <input id={`${f}-due`} name="dueDay" type="number" min={1} max={31} defaultValue={bill?.dueDay ?? ""} placeholder="1-31" className="input" />
        </div>
        <FrequencyFields idPrefix={f} frequency={bill?.frequency} dueMonth={bill?.dueMonth} />
        <div className="col-span-2 min-w-0 md:col-span-2">
          <label className="label" htmlFor={`${f}-keywords`}>
            Words on the bank statement
          </label>
          <input id={`${f}-keywords`} name="matchKeywords" defaultValue={bill?.matchKeywords ?? ""} placeholder="netflix, tnb" className="input" />
        </div>
        <Toggle name="active" defaultChecked={bill?.active ?? true} label="Active" hint="Counted in the plan" className="col-span-2 md:col-span-2" />
        <SubmitButton pendingLabel="Saving..." className="btn-primary col-span-2 w-full md:col-span-6">
          {bill ? "Save bill" : "Add bill"}
        </SubmitButton>
      </ActionForm>
      {bill && (
        <ActionForm action={deleteBill}>
          <input type="hidden" name="id" value={bill.id} />
          {returnAccount && <input type="hidden" name="account" value={returnAccount} />}
          <ConfirmSubmit
            trigger="Delete this bill"
            triggerClassName="btn-danger min-h-11"
            title={`Delete ${bill.name}?`}
            body={deleteBillBody(usage)}
            confirmLabel="Delete bill"
          />
        </ActionForm>
      )}
    </div>
  );
}
