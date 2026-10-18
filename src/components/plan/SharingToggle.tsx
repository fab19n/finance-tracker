import { ChevronDown } from "lucide-react";
import { setSharing } from "@/app/actions/shares";

/**
 * How is this bill split? Every month in equal parts (Netflix: everyone owes a quarter of each month, and a lump sum
 * pays the oldest months) or in turns (Spotify: one person pays the WHOLE month, in rotation).
 */
export function SharingToggle({ billId, billName, sharing }: { billId: number; billName: string; sharing: "monthly" | "turns" }) {
  return (
    <details className="group rounded-2xl bg-card-subtle px-3.5 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-extrabold text-muted [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          How is {billName} split? {sharing === "turns" ? "(in turns)" : "(an equal part every month)"}
        </span>
        <ChevronDown size={16} strokeWidth={2.5} className="shrink-0 transition group-open:rotate-180" aria-hidden />
      </summary>
      <form action={setSharing} className="mt-3 space-y-2.5">
        <input type="hidden" name="billId" value={billId} />
        <select name="sharing" defaultValue={sharing} className="input" aria-label={`How ${billName} is split`}>
          <option value="monthly">Everyone pays an equal part of every month (a lump sum covers the oldest months)</option>
          <option value="turns">One person pays the whole month, in turn (you take some months yourself)</option>
        </select>
        <p className="sub leading-relaxed">
          Switching to turns sets each person&apos;s amount to the bill&apos;s usual amount, and you then plan whose month is whose. Nothing you have received is changed.
        </p>
        <button className="btn">Save</button>
      </form>
    </details>
  );
}
