import { setSharing } from "@/app/actions/shares";

/**
 * How is this bill split? Every month in equal parts (Netflix: everyone owes a quarter of each month, and a lump sum
 * pays the oldest months) or in turns (Spotify: one person pays the WHOLE month, in rotation).
 */
export function SharingToggle({ billId, billName, sharing }: { billId: number; billName: string; sharing: "monthly" | "turns" }) {
  return (
    <details className="rounded-xl border border-line px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-muted">How is {billName} split? {sharing === "turns" ? "(in turns)" : "(an equal part every month)"}</summary>
      <form action={setSharing} className="mt-3 space-y-2">
        <input type="hidden" name="billId" value={billId} />
        <select name="sharing" defaultValue={sharing} className="input w-full" aria-label={`How ${billName} is split`}>
          <option value="monthly">Everyone pays an equal part of every month (a lump sum covers the oldest months)</option>
          <option value="turns">One person pays the whole month, in turn (you take some months yourself)</option>
        </select>
        <p className="text-xs text-muted">
          Switching to turns sets each person&apos;s amount to the bill&apos;s usual amount, and you then plan whose month is whose. Nothing you have received is changed.
        </p>
        <button className="btn !py-2 text-sm">Save</button>
      </form>
    </details>
  );
}
