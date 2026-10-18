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
  // Slot 1 (the text colour), 2 (the accent), a gray for the buffer, 3 (good): the same order as the legend.
  const segments = [
    { label: "Bills", value: p.bills, cls: "bg-series-1" },
    { label: "Everyday allowance", value: allowanceSen, cls: "bg-series-2" },
    { label: "Buffer", value: bufferSen, cls: "bg-ink-muted" },
    { label: "To savings", value: plan.moveToSavings, cls: "bg-series-3" },
  ];

  return (
    <div className="card space-y-3.5">
      <div className="grid grid-cols-2 gap-2.5">
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
      <p className="sub leading-relaxed">
        Pay: {FROM_INCOME[p.incomeFrom]}. Allowance for groceries, fuel, Touch &apos;n Go, food and small things: {FROM_ALLOWANCE[p.allowanceFrom]}.
        Bills use the highest amount each is expected to be ({formatRM(p.bills)}).
      </p>

      <div>
        <div
          className="flex h-3.5 w-full gap-[3px] overflow-hidden rounded-full"
          role="img"
          aria-label={`Of ${formatRM(incomeSen)}: bills ${formatRM(p.bills)}, everyday ${formatRM(allowanceSen)}, buffer ${formatRM(bufferSen)}, to savings ${formatRM(plan.moveToSavings)}`}
        >
          {segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <div key={s.label} className={s.cls} style={{ flexGrow: s.value, flexBasis: 0, minWidth: 2 }} title={s.label} />
            ))}
        </div>
        <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-xs font-bold">
          {segments.map((s) => (
            <li key={s.label} className="min-w-0">
              <span className="flex items-center gap-1.5 font-extrabold">
                <span className={`size-2.5 shrink-0 rounded-full ${s.cls}`} />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="num block pl-4 text-muted">
                {formatRM(s.value)}
                {incomeSen > 0 && ` · ${formatPct(s.value / incomeSen)}`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {allowanceSen === 0 && plan.deficit === 0 && (
        <p className="banner banner-warn leading-snug">
          Nothing is set aside for groceries, fuel, Touch &apos;n Go and food yet, so &quot;move to savings&quot; below is overstated. Enter an everyday allowance above, even a rough guess.
        </p>
      )}

      {plan.deficit > 0 ? (
        <p role="alert" className="banner banner-danger leading-snug">
          Bills + allowance + buffer come to {formatRM(plan.keepInMain)}, which is {formatRM(plan.deficit)} more than your pay. Lower the allowance or
          review the bills.
        </p>
      ) : (
        <div className="rounded-[18px] bg-good-soft p-3.5 text-center text-good">
          <p className="text-xs font-extrabold">Keep {formatRM(plan.keepInMain)} in your spending account, then move</p>
          <p className="num text-[26px] font-black leading-tight tracking-[-0.02em] md:text-[30px]">{formatRM(plan.moveToSavings)} to savings</p>
          <p className="text-[11px] font-bold">
            one transfer, once{plan.savingsRate !== null ? `, ${formatPct(plan.savingsRate)} of your pay` : ""}. No more topping up bill by bill.
          </p>
        </div>
      )}

      {plan.usual && (
        <div className="space-y-1 rounded-2xl bg-card-subtle p-3.5 text-[13px] font-semibold leading-snug">
          <p className="font-black">What your usual {formatRM(plan.usual.transfer)} really does</p>
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

      <form action={recordPaydayTransfer} className="grid grid-cols-2 gap-2.5" key={plan.moveToSavings}>
        <div>
          <label className="label">Amount you moved to savings (RM)</label>
          <input name="amount" inputMode="decimal" defaultValue={senToInput(plan.moveToSavings)} required className="input" />
        </div>
        <div>
          <label className="label">Date</label>
          <input name="date" type="date" defaultValue={p.today} required className="input" />
        </div>
        <button className="btn-primary col-span-2 w-full" disabled={!p.canRecord}>
          I moved it
        </button>
        {!p.canRecord && <p className="sub col-span-2">Choose your spending and savings accounts in Settings to record the transfer here.</p>}
      </form>
    </div>
  );
}
