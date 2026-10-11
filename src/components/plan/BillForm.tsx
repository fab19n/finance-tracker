import { deleteBill, saveBill } from "@/app/actions/plan";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { senToInput } from "@/lib/money";
import type { BillRow } from "@/lib/queries/plan";

type Option = { id: number; name: string; icon?: string };

/** Add / edit form for one recurring bill. A server component: plain fields posting to the action. */
export function BillForm({ bill, categories, accounts }: { bill?: BillRow; categories: Option[]; accounts: Option[] }) {
  const fixed = bill ? bill.amountMin === bill.amountMax : true;
  return (
    <div className="space-y-2">
      <form action={saveBill} className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {bill && <input type="hidden" name="id" value={bill.id} />}
        <input name="name" defaultValue={bill?.name} placeholder="Bill name" required className="input col-span-2 md:col-span-2" aria-label="Name" />
        <select name="categoryId" defaultValue={bill?.categoryId ?? ""} required className="input col-span-2 md:col-span-2" aria-label="Category">
          <option value="" disabled>
            Category…
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <select name="accountId" defaultValue={bill?.accountId} required className="input col-span-2 md:col-span-2" aria-label="Paid from">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              Paid from {a.name}
            </option>
          ))}
        </select>
        <input name="amountMin" defaultValue={bill ? senToInput(bill.amountMin) : ""} placeholder="Amount RM" inputMode="decimal" required className="input" aria-label="Amount" />
        <input
          name="amountMax"
          defaultValue={bill && !fixed ? senToInput(bill.amountMax) : ""}
          placeholder="…up to (if it varies)"
          inputMode="decimal"
          className="input"
          aria-label="Up to"
        />
        <input name="dueDay" type="number" min={1} max={31} defaultValue={bill?.dueDay ?? ""} placeholder="Due day" className="input" aria-label="Due day of month" />
        <input name="matchKeywords" defaultValue={bill?.matchKeywords ?? ""} placeholder="Words on the bank statement (netflix, tnb)" className="input col-span-2 md:col-span-2" aria-label="Statement keywords" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={bill?.active ?? true} className="size-4 accent-[var(--accent)]" /> Active
        </label>
        <button className="btn-primary col-span-2 !py-2.5 text-sm md:col-span-6">{bill ? "Save bill" : "Add bill"}</button>
      </form>
      {bill && (
        <form action={deleteBill}>
          <input type="hidden" name="id" value={bill.id} />
          <ConfirmSubmit
            trigger="Delete this bill (payments already recorded stay)"
            triggerClassName="btn-danger"
            title={`Delete ${bill.name}?`}
            body="The bill goes away. Payments you already recorded for it stay in your books."
            confirmLabel="Delete bill"
          />
        </form>
      )}
    </div>
  );
}
