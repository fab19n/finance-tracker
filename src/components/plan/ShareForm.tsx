"use client";

import { ArrowRight, Info, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteShare, saveShare } from "@/app/actions/shares";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { SubmitButton } from "@/components/SubmitButton";
import { Toggle } from "@/components/Toggle";
import { formatRM, senToInput } from "@/lib/money";
import type { ShareRow } from "@/lib/queries/shares";

/** `amount` is the bill's usual month; `sharers` how many people already share it (for the sentence under the form). */
type Bill = { id: number; name: string; sharing?: "monthly" | "turns"; amount?: number; sharers?: number };

/** Add / edit one person who shares a bill: plain fields posting to the action, each with its own label. */
export function ShareForm({ share, bills, defaultBillId, defaultStart, withRemove = false }: { share?: ShareRow; bills: Bill[]; defaultBillId?: number; defaultStart: string; withRemove?: boolean }) {
  const f = `share-${share?.id ?? "new"}`;
  // How the chosen bill is split decides what the amount means: an equal part of each month, or (in turns) the whole month, which the app fills in.
  const [billId, setBillId] = useState(String(share?.billId ?? defaultBillId ?? ""));
  const chosen = bills.find((b) => String(b.id) === billId);
  const turns = chosen?.sharing === "turns";
  // A new person's likely part: the bill split equally between you, the people already on it and them.
  const parts = (chosen?.sharers ?? 0) + 2;
  return (
    <div className="space-y-2">
      <ActionForm action={saveShare} className="grid grid-cols-2 gap-2.5 md:grid-cols-6">
        {share && <input type="hidden" name="id" value={share.id} />}
        <div className="col-span-2 min-w-0 md:col-span-2">
          <label className="label" htmlFor={`${f}-bill`}>
            Bill
          </label>
          <select id={`${f}-bill`} name="billId" value={billId} onChange={(e) => setBillId(e.target.value)} required className="input">
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
            Name
          </label>
          <input id={`${f}-name`} name="name" defaultValue={share?.name} placeholder="e.g. Mei Ling" required className="input" />
        </div>
        {turns ? (
          <p className="sub col-span-2 min-w-0 self-end md:col-span-2">
            This bill is paid in turns: they pay the whole month when it is their turn, so there is no part to enter.
          </p>
        ) : (
          <div className="col-span-2 min-w-0 md:col-span-2">
            <label className="label" htmlFor={`${f}-share`}>
              They owe you a month (RM)
            </label>
            <input id={`${f}-share`} name="share" defaultValue={share ? senToInput(share.share) : ""} placeholder="e.g. 5.15" inputMode="decimal" required className="input" />
          </div>
        )}
        <div className="col-span-1 min-w-0 md:col-span-2">
          <label className="label" htmlFor={`${f}-start`}>
            From
          </label>
          <input id={`${f}-start`} name="startMonth" type="month" defaultValue={share?.startMonth ?? defaultStart} required className="input" />
        </div>
        <div className="col-span-1 min-w-0 md:col-span-2">
          <label className="label" htmlFor={`${f}-end`}>
            Until (optional)
          </label>
          <input id={`${f}-end`} name="endMonth" type="month" defaultValue={share?.endMonth ?? ""} className="input" />
        </div>
        <div className="col-span-2 min-w-0 md:col-span-4">
          <label className="label" htmlFor={`${f}-keywords`}>
            Words on your bank statement when they pay you
          </label>
          <input id={`${f}-keywords`} name="matchKeywords" defaultValue={share?.matchKeywords ?? ""} placeholder="e.g. a surname" className="input" />
        </div>
        {share ? (
          <Toggle name="active" defaultChecked={share.active} label="Still sharing" hint="Off once they have left the bill" className="col-span-2 md:col-span-2" />
        ) : (
          <input type="hidden" name="active" value="on" />
        )}
        {!share && chosen && (
          <p className="banner banner-info col-span-2 md:col-span-6">
            <Info aria-hidden />
            <span className="min-w-0">
              {turns
                ? `${chosen.name} is paid in turns: they pay the whole month on their turn. Earlier months are worked out from what the bill was charged then.`
                : chosen.amount
                  ? `Split equally between you and ${parts - 1} other${parts - 1 === 1 ? "" : "s"}, a part of ${chosen.name} is about ${formatRM(Math.round(chosen.amount / parts))}. Earlier months are worked out from what the bill was charged then.`
                  : "Earlier months are worked out from what the bill was charged then."}
            </span>
          </p>
        )}
        <SubmitButton pendingLabel="Saving..." className="btn-primary col-span-2 w-full md:col-span-6">
          {share ? "Save" : <>Add person <ArrowRight size={16} strokeWidth={2.5} aria-hidden /></>}
        </SubmitButton>
      </ActionForm>
      {share && withRemove && (
        <ActionForm action={deleteShare}>
          <input type="hidden" name="id" value={share.id} />
          <ConfirmSubmit
            trigger="Remove from this bill (money they sent stays in your records)"
            triggerClassName="btn-danger min-h-11"
            title={`Remove ${share.name} from this bill?`}
            body="They stop being counted on this bill. Money they already sent stays in your records."
            confirmLabel="Remove"
          />
        </ActionForm>
      )}
    </div>
  );
}

/**
 * A person on a bill: small "Edit" (opens the full form) and "Remove" (asks first) buttons, as the design draws them,
 * instead of the whole form always open under each row.
 */
export function ShareActions({ share, bills, defaultStart }: { share: ShareRow; bills: Bill[]; defaultStart: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
          <Pencil size={14} strokeWidth={2.5} aria-hidden /> {editing ? "Close" : "Edit"}
        </button>
        <ActionForm action={deleteShare}>
          <input type="hidden" name="id" value={share.id} />
          <ConfirmSubmit
            trigger={
              <>
                <Trash2 size={14} strokeWidth={2.5} aria-hidden /> Remove
              </>
            }
            triggerClassName="btn text-danger"
            triggerLabel={`Remove ${share.name} from this bill`}
            title={`Remove ${share.name} from this bill?`}
            body="They stop being counted on this bill. Money they already sent stays in your records."
            confirmLabel="Remove"
          />
        </ActionForm>
      </div>
      {editing && <ShareForm share={share} bills={bills} defaultStart={defaultStart} />}
    </div>
  );
}
