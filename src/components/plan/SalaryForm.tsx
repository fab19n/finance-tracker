import { recordSalary } from "@/app/actions/plan";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";

/** "Record salary" on the Plan page: its two fields and the button, with a pending state and the can't-reach-your-PC banner. */
export function SalaryForm({ defaultAmount, today, canRecord }: { defaultAmount: string; today: string; canRecord: boolean }) {
  return (
    <ActionForm action={recordSalary} className="grid grid-cols-2 gap-2.5 md:grid-cols-[1fr_1fr_auto]">
      <div>
        <label className="label !text-foreground" htmlFor="salary-amount">
          Take-home pay (RM)
        </label>
        <input id="salary-amount" name="amount" inputMode="decimal" defaultValue={defaultAmount} placeholder="5400" required className="input" />
      </div>
      <div>
        <label className="label !text-foreground" htmlFor="salary-date">
          Received on
        </label>
        <input id="salary-date" name="date" type="date" defaultValue={today} required className="input" />
      </div>
      <SubmitButton pendingLabel="Recording..." className="btn-primary col-span-2 self-end md:col-span-1" disabled={!canRecord}>
        Record salary
      </SubmitButton>
      {!canRecord && <p className="col-span-2 text-xs font-extrabold text-warn md:col-span-3">Choose your spending account in Settings first.</p>}
    </ActionForm>
  );
}
