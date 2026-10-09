"use client";

import { useState } from "react";
import { recordPaydayTransfer } from "@/app/actions/plan";
import { formatPct, formatRM, parseSen, senToInput } from "@/lib/money";
import { planPayday } from "@/lib/plan/payday";

type Props = {
  income: number;
  incomeFrom: "salary" | "settings" | "none";
  bills: number;
  allowance: number;
  allowanceFrom: "settings" | "history" | "none";
  buffer: number;
  usualTransfer: number | null;
  canRecord: boolean;
  today: string;
};

const FROM_INCOME = {
  salary: "your last recorded salary",
  settings: "the take-home pay in Settings",
  none: "enter your take-home pay",
} as const;
const FROM_ALLOWANCE = {
  settings: "from Settings",
  history: "estimated from what you actually spent",
  none: "your guess is fine; the Dashboard will show the truth",
} as const;

/**
 * Decide once, at payday, how salary is split. Everything recomputes as you type, so you can try
 * "what if I allow RM 1,200 for everyday things?" before touching any money.
 */
export function PaydayPlanner(p: Props) {
  const [income, setIncome] = useState(p.income ? senToInput(p.income) : "");
  const [allowance, setAllowance] = useState(p.allowance ? senToInput(p.allowance) : "");
  const [buffer, setBuffer] = useState(senToInput(p.buffer));
  const [usual, setUsual] = useState(p.usualTransfer !== null ? senToInput(p.usualTransfer) : "");

  const incomeSen = parseSen(income) ?? 0;
  const allowanceSen = parseSen(allowance) ?? 0;
  const bufferSen = parseSen(buffer) ?? 0;
  const usualSen = usual.trim() ? (parseSen(usual) ?? undefined) : undefined;

  const plan = planPayday({ income: incomeSen, bills: p.bills, allowance: allowanceSen, buffer: bufferSen, usualTransfer: usualSen });
  const segments = [
    { label: "Bills", value: p.bills, cls: "bg-series-1" },
    { label: "Everyday allowance", value: allowanceSen, cls: "bg-series-2" },
    { label: "Buffer", value: bufferSen, cls: "bg-[var(--series-gray)]" },
    { label: "To savings", value: plan.moveToSavings, cls: "bg-series-3" },
  ];

  return (
    <div className="card space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <label>
          <span className="label">Take-home pay (RM)</span>
          <input value={income} onChange={(e) => setIncome(e.target.value)} inputMode="decimal" placeholder="5400" className="input" />
        </label>
        <label>
          <span className="label">Everyday allowance (RM)</span>
          <input value={allowance} onChange={(e) => setAllowance(e.target.value)} inputMode="decimal" placeholder="1000" className="input" />
        </label>
        <label>
          <span className="label">Buffer (RM)</span>
          <input value={buffer} onChange={(e) => setBuffer(e.target.value)} inputMode="decimal" className="input" />
        </label>
        <label>
          <span className="label">What you usually move (RM)</span>
          <input value={usual} onChange={(e) => setUsual(e.target.value)} inputMode="decimal" placeholder="4200" className="input" />
        </label>
      </div>
      <p className="text-xs text-muted">
        Pay: {FROM_INCOME[p.incomeFrom]}. Allowance for groceries, fuel, Touch &apos;n Go, food and small things: {FROM_ALLOWANCE[p.allowanceFrom]}.
        Bills use the highest amount each is expected to be ({formatRM(p.bills)}).
      </p>

      <div
        className="flex h-5 w-full gap-0.5 overflow-hidden rounded-md"
        role="img"
        aria-label={`Of ${formatRM(incomeSen)}: bills ${formatRM(p.bills)}, everyday ${formatRM(allowanceSen)}, buffer ${formatRM(bufferSen)}, to savings ${formatRM(plan.moveToSavings)}`}
      >
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div key={s.label} className={s.cls} style={{ flexGrow: s.value, flexBasis: 0, minWidth: 2 }} title={s.label} />
          ))}
      </div>
      <ul className="grid gap-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`size-2.5 rounded-sm ${s.cls}`} />
            <span>{s.label}</span>
            <span className="num ml-auto font-semibold">{formatRM(s.value)}</span>
            <span className="num w-12 text-right text-xs text-muted">{incomeSen > 0 ? formatPct(s.value / incomeSen) : ""}</span>
          </li>
        ))}
      </ul>

      {allowanceSen === 0 && plan.deficit === 0 && (
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          Nothing is set aside for groceries, fuel, Touch &apos;n Go and food yet, so &quot;move to savings&quot; below is overstated. Enter an everyday allowance above, even a rough guess.
        </p>
      )}

      {plan.deficit > 0 ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
          Bills + allowance + buffer come to {formatRM(plan.keepInMain)}, which is {formatRM(plan.deficit)} more than your pay. Lower the allowance or
          review the bills.
        </p>
      ) : (
        <div className="rounded-xl bg-accent-soft px-3 py-3 text-accent">
          <p className="text-xs font-medium">Keep {formatRM(plan.keepInMain)} in your spending account, then move</p>
          <p className="text-2xl font-semibold tracking-tight">{formatRM(plan.moveToSavings)} to savings</p>
          <p className="text-xs">
            one transfer, once{plan.savingsRate !== null ? `, ${formatPct(plan.savingsRate)} of your pay` : ""}. No more topping up bill by bill.
          </p>
        </div>
      )}

      {plan.usual && (
        <div className="space-y-1 rounded-xl border border-line bg-background px-3 py-3 text-sm">
          <p className="font-semibold">What your usual {formatRM(plan.usual.transfer)} really does</p>
          <p>
            It leaves <strong>{formatRM(plan.usual.leftInMain)}</strong> for bills that need {formatRM(p.bills)}, so{" "}
            <strong className={plan.usual.billsGap > 0 ? "text-danger" : ""}>{formatRM(plan.usual.billsGap)}</strong> must come straight back out of savings
            {plan.usual.leftForEveryday < 0 ? ", before a single grocery, fuel or food purchase" : ""}.
          </p>
          {allowanceSen > 0 && (
            <p>
              Add your {formatRM(allowanceSen)} everyday allowance and about <strong>{formatRM(plan.usual.takenBackAtLeast)}</strong> of the{" "}
              {formatRM(plan.usual.transfer)} returns. What you really save is nearer{" "}
              <strong>{formatRM(Math.max(0, plan.usual.transfer - plan.usual.takenBackAtLeast))}</strong>.
            </p>
          )}
        </div>
      )}

      <form action={recordPaydayTransfer} className="grid grid-cols-2 gap-2 border-t border-line pt-4 md:grid-cols-[1fr_1fr_auto]" key={plan.moveToSavings}>
        <div>
          <label className="label">Amount you moved to savings (RM)</label>
          <input name="amount" inputMode="decimal" defaultValue={senToInput(plan.moveToSavings)} required className="input" />
        </div>
        <div>
          <label className="label">Date</label>
          <input name="date" type="date" defaultValue={p.today} required className="input" />
        </div>
        <button className="btn-primary col-span-2 self-end !py-2.5 text-sm md:col-span-1" disabled={!p.canRecord}>
          I moved it
        </button>
        {!p.canRecord && <p className="col-span-2 text-xs text-muted md:col-span-3">Choose your spending and savings accounts in Settings to record the transfer here.</p>}
      </form>
    </div>
  );
}
