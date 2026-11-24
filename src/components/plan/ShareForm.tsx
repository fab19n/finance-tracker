import { deleteShare, saveShare } from "@/app/actions/shares";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { SubmitButton } from "@/components/SubmitButton";
import { senToInput } from "@/lib/money";
import type { ShareRow } from "@/lib/queries/shares";

type Bill = { id: number; name: string };

/** Add / edit one person who shares a bill: plain fields posting to the action, each with its own label. */
export function ShareForm({ share, bills, defaultBillId, defaultStart }: { share?: ShareRow; bills: Bill[]; defaultBillId?: number; defaultStart: string }) {
  const f = `share-${share?.id ?? "new"}`;
  return (
    <div className="space-y-2">
      <ActionForm action={saveShare} className="grid grid-cols-2 gap-2.5 md:grid-cols-6">
        {share && <input type="hidden" name="id" value={share.id} />}
        <div className="col-span-2 min-w-0 md:col-span-2">
          <label className="label" htmlFor={`${f}-bill`}>
            Shared bill
          </label>
          <select id={`${f}-bill`} name="billId" defaultValue={share?.billId ?? defaultBillId ?? ""} required className="input">
            <option value="" disabled>
              Which bill…
            </option>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 min-w-0 md:col-span-2">
          <label className="label" htmlFor={`${f}-name`}>
            Person
          </label>
          <input id={`${f}-name`} name="name" defaultValue={share?.name} placeholder="Their name" required className="input" />
        </div>
        <div className="col-span-2 min-w-0 md:col-span-2">
          <label className="label" htmlFor={`${f}-share`}>
            Their share per month (RM)
          </label>
          <input id={`${f}-share`} name="share" defaultValue={share ? senToInput(share.share) : ""} placeholder="e.g. 5.15" inputMode="decimal" required className="input" />
        </div>
        <div className="col-span-1 min-w-0 md:col-span-2">
          <label className="label" htmlFor={`${f}-start`}>
            Sharing since
          </label>
          <input id={`${f}-start`} name="startMonth" type="month" defaultValue={share?.startMonth ?? defaultStart} required className="input" />
        </div>
        <div className="col-span-1 min-w-0 md:col-span-2">
          <label className="label" htmlFor={`${f}-end`}>
            Until (if they left)
          </label>
          <input id={`${f}-end`} name="endMonth" type="month" defaultValue={share?.endMonth ?? ""} className="input" />
        </div>
        <div className="col-span-2 min-w-0 md:col-span-4">
          <label className="label" htmlFor={`${f}-keywords`}>
            Words on your bank statement when they pay you
          </label>
          <input id={`${f}-keywords`} name="matchKeywords" defaultValue={share?.matchKeywords ?? ""} placeholder="e.g. a surname" className="input" />
        </div>
        <label className="col-span-2 flex min-h-11 items-center gap-2 text-[13px] font-extrabold md:col-span-2">
          <input type="checkbox" name="active" defaultChecked={share?.active ?? true} className="size-4 accent-accent-strong" /> Still sharing
        </label>
        <SubmitButton pendingLabel="Saving..." className="btn-primary col-span-2 w-full md:col-span-6">
          {share ? "Save" : "Add person"}
        </SubmitButton>
      </ActionForm>
      {share && (
        <ActionForm action={deleteShare}>
          <input type="hidden" name="id" value={share.id} />
          <ConfirmSubmit
            trigger="Remove from this bill (money they sent stays in your records)"
            triggerClassName="btn-danger"
            title={`Remove ${share.name} from this bill?`}
            body="They stop being counted on this bill. Money they already sent stays in your records."
            confirmLabel="Remove"
          />
        </ActionForm>
      )}
    </div>
  );
}
