"use client";

import { useState } from "react";
import { addInvestment } from "@/app/actions/investments";

type Product = "sp500_etf" | "fixed_deposit" | "asb" | "other";

const PRODUCTS: { value: Product; label: string; hint: string }[] = [
  { value: "sp500_etf", label: "S&P 500 fund / ETF", hint: "Track units and (optionally) live prices." },
  { value: "fixed_deposit", label: "Fixed deposit", hint: "Value grows automatically from the rate and dates." },
  { value: "asb", label: "ASB / unit trust", hint: "Update the value yourself now and then." },
  { value: "other", label: "Something else", hint: "Update the value yourself now and then." },
];

export function AddInvestmentForm({
  fundingAccounts,
  today,
  oneYearOn,
}: {
  fundingAccounts: { id: number; name: string }[];
  today: string;
  oneYearOn: string;
}) {
  const [product, setProduct] = useState<Product>("sp500_etf");
  const isFd = product === "fixed_deposit";
  const isEtf = product === "sp500_etf";

  return (
    <form action={addInvestment} className="@container space-y-3.5">
      <div>
        <label className="label" htmlFor="product">
          What kind of investment?
        </label>
        <select id="product" name="product" value={product} onChange={(e) => setProduct(e.target.value as Product)} className="input">
          {PRODUCTS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="sub mt-1.5">{PRODUCTS.find((p) => p.value === product)?.hint}</p>
      </div>

      <div className="grid gap-3 @sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input id="name" name="name" required placeholder={isFd ? "e.g. Maybank FD 12M" : isEtf ? "e.g. VOO via Moomoo" : "Name"} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="amount">
            {isFd ? "Principal (RM)" : "Amount put in so far (RM)"}
          </label>
          <input id="amount" name="amount" inputMode="decimal" placeholder="0.00" required={isFd} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="date">
            {isFd ? "Start date" : "Date invested"}
          </label>
          <input id="date" name="date" type="date" defaultValue={today} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="fromAccountId">
            Paid from
          </label>
          <select id="fromAccountId" name="fromAccountId" className="input">
            {fundingAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isFd && (
        <div className="grid gap-3 @lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="annualRatePct">
              Interest rate (% p.a.)
            </label>
            <input id="annualRatePct" name="annualRatePct" type="number" step="0.01" min="0" required placeholder="3.05" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="maturityDate">
              Matures on
            </label>
            <input id="maturityDate" name="maturityDate" type="date" defaultValue={oneYearOn} required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="compounding">
              Interest paid
            </label>
            <select id="compounding" name="compounding" defaultValue="simple" className="input">
              <option value="simple">At maturity (simple)</option>
              <option value="monthly">Compounded monthly</option>
              <option value="quarterly">Compounded quarterly</option>
              <option value="annually">Compounded yearly</option>
            </select>
          </div>
        </div>
      )}

      {isEtf && (
        <div className="grid gap-3 @lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="ticker">
              Ticker (optional)
            </label>
            <input id="ticker" name="ticker" placeholder="VOO, SPY, CSPX.L" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="units">
              Units held (optional)
            </label>
            <input id="units" name="units" type="number" step="any" min="0" placeholder="e.g. 2.5" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="priceCurrency">
              Quoted in
            </label>
            <select id="priceCurrency" name="priceCurrency" defaultValue="USD" className="input">
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
              <option value="MYR">MYR</option>
              <option value="SGD">SGD</option>
            </select>
          </div>
        </div>
      )}

      <label className="flex items-start gap-2.5 rounded-2xl bg-card-subtle p-3 text-[13px] font-bold">
        <input type="checkbox" name="recordTransfer" defaultChecked className="mt-0.5 size-4 shrink-0 accent-accent" />
        <span>
          Also record the transfer out of that account <span className="text-muted">(keeps your bank balance accurate - it&apos;s not counted as spending)</span>
        </span>
      </label>

      <button className="btn-primary w-full md:w-auto">Add investment</button>
    </form>
  );
}
