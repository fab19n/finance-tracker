"use client";

import { useState } from "react";

type Props = {
  /** Used to make the ids of one form unique on a page that shows many. */
  idPrefix: string;
  type?: "income" | "expense";
  nature?: "need" | "want" | "saving";
  /** The monthly budget as the box shows it ("150.00"), or "". */
  budget?: string;
};

/**
 * The type, need-or-want and budget fields of a category form. A need/want split and a monthly budget are about
 * spending, so they are only shown for an expense category; an income category is always filed as "Saving / Income"
 * and has no budget (changing the type switches the fields at once, and nothing hidden is sent).
 */
export function CategoryFields({ idPrefix, type = "expense", nature, budget = "" }: Props) {
  const [kind, setKind] = useState<"income" | "expense">(type);
  return (
    <>
      <div className="min-w-0">
        <label className="label" htmlFor={`${idPrefix}-type`}>
          Type
        </label>
        <select id={`${idPrefix}-type`} name="type" value={kind} onChange={(e) => setKind(e.target.value === "income" ? "income" : "expense")} className="input">
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </div>
      {kind === "expense" ? (
        <>
          <div className="min-w-0">
            <label className="label" htmlFor={`${idPrefix}-nature`}>
              Need or want
            </label>
            <select id={`${idPrefix}-nature`} name="nature" defaultValue={nature ?? "want"} className="input">
              <option value="need">Need</option>
              <option value="want">Want</option>
              {nature === "saving" && <option value="saving">Saving</option>}
            </select>
          </div>
          <div className="col-span-2 min-w-0 md:col-span-6">
            <label className="label" htmlFor={`${idPrefix}-budget`}>
              Monthly budget (RM, optional)
            </label>
            <input id={`${idPrefix}-budget`} name="monthlyBudget" defaultValue={budget} placeholder="e.g. 400" inputMode="decimal" className="input" />
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="nature" value="saving" />
          <p className="sub col-span-2 min-w-0 self-end md:col-span-2">Income has no need/want split and no budget.</p>
        </>
      )}
    </>
  );
}
