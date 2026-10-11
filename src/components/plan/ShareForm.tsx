import { deleteShare, saveShare } from "@/app/actions/shares";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { senToInput } from "@/lib/money";
import type { ShareRow } from "@/lib/queries/shares";

type Bill = { id: number; name: string };

/** Add / edit one person who shares a bill. A server component: plain fields posting to the action. */
export function ShareForm({ share, bills, defaultBillId, defaultStart }: { share?: ShareRow; bills: Bill[]; defaultBillId?: number; defaultStart: string }) {
  return (
    <div className="space-y-2">
      <form action={saveShare} className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {share && <input type="hidden" name="id" value={share.id} />}
        <select name="billId" defaultValue={share?.billId ?? defaultBillId ?? ""} required className="input col-span-2 md:col-span-2" aria-label="Shared bill">
          <option value="" disabled>
            Which bill…
          </option>
          {bills.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input name="name" defaultValue={share?.name} placeholder="Person's name" required className="input col-span-2 md:col-span-2" aria-label="Person" />
        <input name="share" defaultValue={share ? senToInput(share.share) : ""} placeholder="Their share per month, RM" inputMode="decimal" required className="input col-span-2 md:col-span-2" aria-label="Share per month" />
        <label className="col-span-1 text-xs text-muted md:col-span-2">
          Sharing since
          <input name="startMonth" type="month" defaultValue={share?.startMonth ?? defaultStart} required className="input mt-1 w-full" />
        </label>
        <label className="col-span-1 text-xs text-muted md:col-span-2">
          Until (if they left)
          <input name="endMonth" type="month" defaultValue={share?.endMonth ?? ""} className="input mt-1 w-full" />
        </label>
        <input
          name="matchKeywords"
          defaultValue={share?.matchKeywords ?? ""}
          placeholder="Words on your bank statement when they pay you (e.g. kuganesh)"
          className="input col-span-2 md:col-span-4"
          aria-label="Words on the bank statement"
        />
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" name="active" defaultChecked={share?.active ?? true} className="size-4 accent-[var(--accent)]" /> Still sharing
        </label>
        <button className="btn-primary col-span-2 !py-2.5 text-sm md:col-span-6">{share ? "Save" : "Add person"}</button>
      </form>
      {share && (
        <form action={deleteShare}>
          <input type="hidden" name="id" value={share.id} />
          <ConfirmSubmit
            trigger="Remove from this bill (money they sent stays in your records)"
            triggerClassName="btn-danger"
            title={`Remove ${share.name} from this bill?`}
            body="They stop being counted on this bill. Money they already sent stays in your records."
            confirmLabel="Remove"
          />
        </form>
      )}
    </div>
  );
}
