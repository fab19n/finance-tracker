"use client";

import { useState } from "react";
import { MONTH_NAMES, type BillFrequency } from "@/lib/plan/bills";

const OPTIONS: { value: BillFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "yearly", label: "Once a year" },
];

/**
 * "How often" for a bill, and, for a bill that is not monthly, the month it is due in (for every 3 months: the first of the
 * four). The month box only appears when it is needed; the server checks the pair again.
 */
export function FrequencyFields({ idPrefix, frequency = "monthly", dueMonth }: { idPrefix: string; frequency?: BillFrequency; dueMonth?: number | null }) {
  const [freq, setFreq] = useState<BillFrequency>(frequency);
  return (
    <>
      <div className="col-span-2 min-w-0 md:col-span-2">
        <label className="label" htmlFor={`${idPrefix}-freq`}>
          How often
        </label>
        <select id={`${idPrefix}-freq`} name="frequency" value={freq} onChange={(e) => setFreq(e.target.value as BillFrequency)} className="input">
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {freq !== "monthly" && (
        <div className="col-span-2 min-w-0 md:col-span-2">
          <label className="label" htmlFor={`${idPrefix}-month`}>
            {freq === "yearly" ? "Due in" : "First due in"}
          </label>
          <select id={`${idPrefix}-month`} name="dueMonth" defaultValue={dueMonth ?? ""} required className="input">
            <option value="" disabled>
              Choose a month…
            </option>
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          {freq === "quarterly" && <p className="sub mt-1">Then every 3 months after that.</p>}
        </div>
      )}
    </>
  );
}
