"use client";

import { useState } from "react";
import type { CsvLayout } from "@/lib/import/types";

type Overrides = Partial<Omit<CsvLayout, "headerRow">> & { headerRow?: number };

/**
 * For a CSV the reader couldn't understand (or read wrongly): look at the first rows and say which column is which.
 * `hasHeader` = the first row holds column names rather than data.
 */
export function ColumnMapper({
  sample,
  headers,
  initial,
  onApply,
  busy,
}: {
  sample: string[][];
  headers?: string[];
  initial?: CsvLayout;
  onApply: (o: Overrides) => void;
  busy: boolean;
}) {
  const width = Math.max(headers?.length ?? 0, ...sample.map((r) => r.length), 1);
  const cols = Array.from({ length: width }, (_, i) => i);
  const label = (i: number) => (headers?.[i] ? `${i + 1}: ${headers[i]}` : `Column ${i + 1}`);

  const [date, setDate] = useState<number | "">(initial?.date ?? "");
  const [description, setDescription] = useState<number | "">(initial?.description?.[0] ?? "");
  const [shape, setShape] = useState<"amount" | "split">(initial && initial.amount === null && (initial.debit !== null || initial.credit !== null) ? "split" : "amount");
  const [amount, setAmount] = useState<number | "">(initial?.amount ?? "");
  const [debit, setDebit] = useState<number | "">(initial?.debit ?? "");
  const [credit, setCredit] = useState<number | "">(initial?.credit ?? "");
  const [balance, setBalance] = useState<number | "">(initial?.balance ?? "");
  const [hasHeader, setHasHeader] = useState(!!headers?.length);
  const [dateFormat, setDateFormat] = useState<"dmy" | "mdy" | "ymd">(initial?.dateFormat ?? "dmy");

  const pick = (value: number | "", set: (v: number | "") => void, name: string, optional = false) => (
    <label className="block min-w-0">
      <span className="label">{name}</span>
      <select className="input" value={value} onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))}>
        <option value="">{optional ? "(none)" : "Choose…"}</option>
        {cols.map((i) => (
          <option key={i} value={i}>
            {label(i)}
          </option>
        ))}
      </select>
    </label>
  );

  const ready = date !== "" && description !== "" && (shape === "amount" ? amount !== "" : debit !== "" || credit !== "");

  return (
    <div className="space-y-3.5 text-[13px] font-bold">
      {/* The sample rows sit in a grey box that scrolls sideways inside the card when there are many columns. */}
      <div className="overflow-x-auto rounded-2xl bg-card-subtle">
        <table className="w-full text-left text-xs">
          <tbody className="divide-y divide-line">
            {sample.slice(0, 6).map((r, ri) => (
              <tr key={ri} className={ri === 0 && hasHeader ? "bg-card font-extrabold" : "font-semibold"}>
                {cols.map((c) => (
                  <td key={c} className="max-w-40 truncate px-2.5 py-2">
                    {r[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="flex min-h-8 items-center gap-2">
        <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="size-4 shrink-0 accent-accent" />
        The first row holds column names
      </label>

      <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-3">
        {pick(date, setDate, "Date")}
        {pick(description, setDescription, "Description")}
        <label className="block min-w-0">
          <span className="label">Date order</span>
          <select className="input" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as "dmy" | "mdy" | "ymd")}>
            <option value="dmy">Day / Month / Year</option>
            <option value="mdy">Month / Day / Year</option>
            <option value="ymd">Year-Month-Day</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <label className="flex min-h-8 items-center gap-2">
          <input type="radio" checked={shape === "amount"} onChange={() => setShape("amount")} className="size-4 shrink-0 accent-accent" /> One amount column (+ / −)
        </label>
        <label className="flex min-h-8 items-center gap-2">
          <input type="radio" checked={shape === "split"} onChange={() => setShape("split")} className="size-4 shrink-0 accent-accent" /> Separate money out / in columns
        </label>
      </div>

      <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-3">
        {shape === "amount" ? (
          pick(amount, setAmount, "Amount")
        ) : (
          <>
            {pick(debit, setDebit, "Money out (withdrawal / debit)", true)}
            {pick(credit, setCredit, "Money in (deposit / credit)", true)}
          </>
        )}
        {pick(balance, setBalance, "Running balance (recommended)", true)}
      </div>

      <button
        type="button"
        className="btn-primary w-full md:w-auto"
        disabled={!ready || busy}
        onClick={() =>
          onApply({
            headerRow: hasHeader ? 0 : -1,
            date: date === "" ? null : date,
            description: description === "" ? [] : [description],
            amount: shape === "amount" && amount !== "" ? amount : null,
            debit: shape === "split" && debit !== "" ? debit : null,
            credit: shape === "split" && credit !== "" ? credit : null,
            balance: balance === "" ? null : balance,
            dateFormat,
          })
        }
      >
        Read it with these columns
      </button>
    </div>
  );
}
