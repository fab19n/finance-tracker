"use client";

import { useId, useState } from "react";
import { archiveInvestment, recordInvestmentFlow, recordValuation, updateHolding } from "@/app/actions/investments";

type Funding = { id: number; name: string }[];
type Panel = "value" | "in" | "out" | "more";

/**
 * What you can do to one holding: Update value, Add money, Take out, and More (price tracking, archive). Each is a pill; the
 * one you tap opens its form underneath and tapping it again closes it. The forms are the same Server Actions the card
 * always had (one used to list all of them behind a single "Update, add money or take money out").
 */
export function HoldingActions({
  accountId,
  isFd,
  funding,
  today,
  ticker,
  units,
  priceCurrency,
}: {
  accountId: number;
  isFd: boolean;
  funding: Funding;
  today: string;
  ticker: string | null;
  units: number | null;
  priceCurrency: string;
}) {
  const [open, setOpen] = useState<Panel | null>(null);
  const uid = useId();
  const panelId = `${uid}-panel`;
  const tabs: { id: Panel; label: string }[] = [
    ...(isFd ? [] : [{ id: "value" as const, label: "Update value" }]),
    { id: "in", label: "Add money" },
    { id: "out", label: "Take out" },
    { id: "more", label: "More" },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t, i) => {
          const on = open === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-expanded={on}
              aria-controls={panelId}
              onClick={() => setOpen(on ? null : t.id)}
              className={`pill min-h-9 cursor-pointer px-3.5 transition ${
                on ? "bg-foreground text-background" : i === 0 ? "bg-accent-soft text-accent-strong" : "bg-card-subtle text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {open && (
        <div id={panelId} className="mt-3 space-y-4 rounded-2xl bg-card-subtle p-3.5">
          {open === "value" && !isFd && (
            <form action={recordValuation} className="grid grid-cols-2 gap-2.5">
              <input type="hidden" name="accountId" value={accountId} />
              <div>
                <label className="label" htmlFor={`${uid}-worth`}>
                  Worth now (RM)
                </label>
                <input id={`${uid}-worth`} name="value" inputMode="decimal" placeholder="0.00" required className="input" />
              </div>
              <div>
                <label className="label" htmlFor={`${uid}-asof`}>
                  As of
                </label>
                <input id={`${uid}-asof`} name="date" type="date" defaultValue={today} required className="input" />
              </div>
              <button className="btn-primary col-span-2">Update value</button>
            </form>
          )}

          {(open === "in" || open === "out") && (
            <form key={open} action={recordInvestmentFlow} className="grid grid-cols-2 gap-2.5">
              <input type="hidden" name="accountId" value={accountId} />
              <input type="hidden" name="direction" value={open} />
              <div>
                <label className="label" htmlFor={`${uid}-amount`}>
                  {open === "in" ? "Add money (RM)" : "Take out (RM)"}
                </label>
                <input id={`${uid}-amount`} name="amount" inputMode="decimal" placeholder="0.00" required className="input" />
              </div>
              <div>
                <label className="label" htmlFor={`${uid}-date`}>
                  Date
                </label>
                <input id={`${uid}-date`} name="date" type="date" defaultValue={today} required className="input" />
              </div>
              <div className="col-span-2">
                <label className="label" htmlFor={`${uid}-account`}>
                  {open === "in" ? "From" : "Into"}
                </label>
                <select id={`${uid}-account`} name="fromAccountId" className="input">
                  {funding.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn-primary col-span-2">{open === "in" ? "Add money" : "Take out"}</button>
            </form>
          )}

          {open === "more" && (
            <>
              {!isFd && (
                <form action={updateHolding} className="grid grid-cols-2 gap-2.5">
                  <input type="hidden" name="accountId" value={accountId} />
                  <div>
                    <label className="label" htmlFor={`${uid}-ticker`}>
                      Ticker
                    </label>
                    <input id={`${uid}-ticker`} name="ticker" defaultValue={ticker ?? ""} placeholder="VOO" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`${uid}-units`}>
                      Units held
                    </label>
                    <input id={`${uid}-units`} name="units" type="number" step="any" min="0" defaultValue={units ?? ""} className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`${uid}-currency`}>
                      Quoted in
                    </label>
                    <select id={`${uid}-currency`} name="priceCurrency" defaultValue={priceCurrency} className="input">
                      {["USD", "GBP", "EUR", "MYR", "SGD"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn self-end">Save price tracking</button>
                </form>
              )}

              <form action={archiveInvestment}>
                <input type="hidden" name="accountId" value={accountId} />
                <button className="btn-danger">Archive this investment</button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
