import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { setSharing } from "@/app/actions/shares";

/**
 * How is this bill split? A labelled two-way control: every month in equal parts (Netflix: everyone owes a quarter of each
 * month, and a lump sum pays the oldest months) or in turns (Spotify: one person pays the WHOLE month, in rotation). The
 * chosen one is filled and marked `aria-pressed`; the other submits. Switching TO turns asks first, because it sets each
 * person's amount to the bill's usual amount (nothing received is changed).
 */
export function SharingToggle({ billId, billName, sharing }: { billId: number; billName: string; sharing: "monthly" | "turns" }) {
  const id = `split-${billId}`;
  return (
    <div className="space-y-2">
      <p id={id} className="label !mb-0">
        How this bill is split
      </p>
      <ActionForm action={setSharing}>
        <input type="hidden" name="billId" value={billId} />
        <div role="group" aria-labelledby={id} className="seg">
          {sharing === "monthly" ? (
            <>
              <button type="button" className="seg-item on" aria-pressed="true">
                Equal parts
              </button>
              <input type="hidden" name="sharing" value="turns" />
              <ConfirmSubmit
                trigger="In turns"
                triggerClassName="seg-item"
                title={`Split ${billName} in turns?`}
                body="One person pays the whole month, in turn. Each person's amount becomes the bill's usual amount, and you then plan whose month is whose. Nothing you have received is changed."
                confirmLabel="Switch to turns"
                tone="neutral"
              />
            </>
          ) : (
            <>
              <button type="submit" name="sharing" value="monthly" className="seg-item">
                Equal parts
              </button>
              <button type="button" className="seg-item on" aria-pressed="true">
                In turns
              </button>
            </>
          )}
        </div>
      </ActionForm>
      <p className="sub leading-relaxed">
        {sharing === "monthly"
          ? `Each person owes their part of every month, at what ${billName} was charged that month, so a price rise counts only from when it took effect. A payment counts at the price it was made at.`
          : "One person pays the whole month, in turn. A month is open until someone says they will cover it, and a payment settles the month they covered."}
      </p>
    </div>
  );
}
