"use client";

import { Check, Loader2 } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { saveTransaction, type FormState } from "@/app/actions/transactions";

type TxType = "income" | "expense" | "transfer";
type Cat = { id: number; name: string; type: "income" | "expense"; color: string; icon: string };
type Acc = { id: number; name: string; type: string };
type Hint = {
  item: string;
  type: "income" | "expense";
  categoryId: number | null;
  amount: number;
  count: number;
};

export type TxInitial = {
  id: number;
  type: TxType;
  amount: number; // sen
  date: string;
  accountId: number;
  toAccountId: number | null;
  categoryId: number | null;
  item: string | null;
  note: string | null;
};

type Props = {
  accounts: Acc[];
  categories: Cat[];
  hints: Hint[];
  defaultDate: string;
  defaultAccountId: number;
  initial?: TxInitial;
};

const TYPE_LABEL: Record<TxType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

const VISIBLE_CHIPS = 9;

export function TransactionForm({
  accounts,
  categories,
  hints,
  defaultDate,
  defaultAccountId,
  initial,
}: Props) {
  const [type, setType] = useState<TxType>(initial?.type ?? "expense");
  const [amount, setAmount] = useState(initial ? (initial.amount / 100).toFixed(2) : "");
  const [categoryId, setCategoryId] = useState<number | null>(initial?.categoryId ?? null);
  const [item, setItem] = useState(initial?.item ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [accountId, setAccountId] = useState<number>(initial?.accountId ?? defaultAccountId);
  const [toAccountId, setToAccountId] = useState<number | null>(initial?.toAccountId ?? null);
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [showAll, setShowAll] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  // Wrap the server action so a successful *create* clears the form for the next entry.
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, fd) => {
      const result = await saveTransaction(prev, fd);
      if (result.ok && !initial) {
        setAmount("");
        setItem("");
        setNote("");
        setCategoryId(null);
        amountRef.current?.focus();
      }
      return result;
    },
    { ok: false },
  );

  // Investment accounts are only valid as a transfer endpoint (money in/out of an investment),
  // never somewhere you "spend from" or receive a salary into.
  const fromAccounts = type === "transfer" ? accounts : accounts.filter((a) => a.type !== "investment" || a.id === accountId);
  const chips = categories.filter((c) => c.type === type);
  const shownChips = showAll ? chips : chips.slice(0, VISIBLE_CHIPS);
  const typeHints = hints.filter((h) => h.type === type);

  function changeType(next: TxType) {
    setType(next);
    setCategoryId(null);
    setShowAll(false);
    if (next === "transfer") {
      setToAccountId((cur) => cur ?? accounts.find((a) => a.id !== accountId)?.id ?? null);
    } else {
      // If an investment account was picked for a transfer, fall back to a real spending account.
      const current = accounts.find((a) => a.id === accountId);
      if (current?.type === "investment") {
        const fallback = accounts.find((a) => a.type !== "investment");
        if (fallback) setAccountId(fallback.id);
      }
    }
  }

  function changeItem(value: string) {
    setItem(value);
    const match = typeHints.find((h) => h.item.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      if (match.categoryId) setCategoryId(match.categoryId);
      setAmount((cur) => (cur ? cur : (match.amount / 100).toFixed(2)));
    }
  }

  const verb = initial ? "Save changes" : type === "expense" ? "Add expense" : type === "income" ? "Add income" : "Add transfer";

  return (
    <form action={formAction} className="card space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="categoryId" value={categoryId ?? ""} />

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1" role="tablist">
        {(Object.keys(TYPE_LABEL) as TxType[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={type === t}
            onClick={() => changeType(t)}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              type === t
                ? t === "income"
                  ? "bg-income text-accent-fg shadow-sm"
                  : t === "expense"
                    ? "bg-foreground text-background shadow-sm"
                    : "bg-card text-foreground shadow-sm ring-1 ring-line"
                : "text-muted"
            }`}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="amount" className="label">
          Amount
        </label>
        <div className="flex items-baseline gap-2 rounded-xl border border-line bg-background px-4 py-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
          <span className="text-xl font-semibold text-muted">RM</span>
          <input
            ref={amountRef}
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="num w-full bg-transparent text-4xl font-semibold outline-none placeholder:text-line"
            required
          />
        </div>
      </div>

      {type !== "transfer" && (
        <div>
          <span className="label">Category</span>
          <div className="grid grid-cols-3 gap-2">
            {shownChips.map((c) => {
              const selected = categoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  aria-pressed={selected}
                  style={selected ? { borderColor: c.color, backgroundColor: `${c.color}1f` } : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 text-center text-xs font-medium leading-tight transition active:scale-95 ${
                    selected ? "border-2" : "border-line bg-background"
                  }`}
                >
                  <span className="text-lg leading-none">{c.icon}</span>
                  {c.name}
                </button>
              );
            })}
          </div>
          {chips.length > VISIBLE_CHIPS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-xs font-medium text-accent"
            >
              {showAll ? "Show fewer" : `Show all ${chips.length} categories`}
            </button>
          )}
        </div>
      )}

      {type !== "transfer" && (
        <div>
          <label htmlFor="item" className="label">
            What exactly? <span className="normal-case text-muted/80">(item - helps find leaks)</span>
          </label>
          <input
            id="item"
            name="item"
            list="item-hints"
            autoComplete="off"
            placeholder={type === "expense" ? "e.g. teh tarik, Grab, Netflix" : "e.g. March salary"}
            value={item}
            onChange={(e) => changeItem(e.target.value)}
            className="input"
          />
          <datalist id="item-hints">
            {typeHints.slice(0, 120).map((h) => (
              <option key={h.item} value={h.item} />
            ))}
          </datalist>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="accountId" className="label">
            {type === "transfer" ? "From" : type === "income" ? "Into" : "Paid from"}
          </label>
          <select
            id="accountId"
            name="accountId"
            value={accountId}
            onChange={(e) => setAccountId(Number(e.target.value))}
            className="input"
          >
            {fromAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        {type === "transfer" ? (
          <div>
            <label htmlFor="toAccountId" className="label">
              To
            </label>
            <select
              id="toAccountId"
              name="toAccountId"
              value={toAccountId ?? ""}
              onChange={(e) => setToAccountId(Number(e.target.value))}
              className="input"
            >
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="date" className="label">
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
              required
            />
          </div>
        )}
      </div>

      {type === "transfer" && (
        <div>
          <label htmlFor="date" className="label">
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
            required
          />
          <p className="mt-2 text-xs text-muted">
            Moving money between your own accounts (ATM withdrawal, top-up, investing) is not spending.
          </p>
        </div>
      )}

      <details className="text-sm" open={!!initial?.note}>
        <summary className="cursor-pointer text-muted">Add a note</summary>
        <input
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional"
          className="input mt-2"
        />
      </details>

      {state.error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      {state.ok && !initial && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
          <Check size={16} /> Saved
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? <Loader2 size={18} className="animate-spin" /> : null}
        {verb}
      </button>
    </form>
  );
}
