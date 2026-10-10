"use client";

import { Check, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { adoptLookalike, saveTransaction, type FormState } from "@/app/actions/transactions";
import { isISODate, shortDate } from "@/lib/dates";
import { parseSen } from "@/lib/money";
import type { Lookalike } from "@/lib/queries/lookalikes";

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
  const formRef = useRef<HTMLFormElement>(null);

  // "Already in your books?" Once there is an amount, an account and a date, ask whether the bank import already holds this
  // entry (typing something the statement has is how it gets counted twice). Only for NEW entries, best-effort, and silent
  // when it fails: it must never get between you and Save. The answer is kept with the question it answers, so an old
  // answer is never shown for a changed amount.
  const sen = parseSen(amount);
  const lookupKey =
    !initial && sen !== null && sen > 0 && isISODate(date) && (type !== "transfer" || toAccountId !== null)
      ? new URLSearchParams({
          type,
          amount: String(sen),
          date,
          account: String(accountId),
          ...(type === "transfer" ? { to: String(toAccountId) } : {}),
        }).toString()
      : null;
  const [looked, setLooked] = useState<{ key: string; matches: Lookalike[] } | null>(null);
  useEffect(() => {
    if (!lookupKey) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/transactions/lookalikes?${lookupKey}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((body: { matches: Lookalike[] } | null) => body && setLooked({ key: lookupKey, matches: body.matches }))
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [lookupKey]);
  const lookalikes = looked && looked.key === lookupKey ? looked.matches : [];

  // Wrap the server actions so a successful *create* (or "use the bank's entry") clears the form for the next entry.
  // One reducer for both, so they share one pending flag and one place for the result: a message from one can never
  // linger beside the other's.
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, fd) => {
      const result = fd.has("adopt") ? await adoptLookalike(prev, fd) : await saveTransaction(prev, fd);
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
  const [, startTransition] = useTransition();

  // "Use this one": send what is in the form, plus WHICH bank entry to put it on, down the same path as Save. A button of
  // type "button" on purpose: a submit button listed above Save would become the form's default, and pressing Enter in
  // the amount box would then use the bank's entry instead of adding yours.
  function adopt(entryId: number) {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set("adopt", String(entryId));
    startTransition(() => formAction(fd));
  }
  // There has to be something to put on it: what it was, or which category.
  const canAdopt = type !== "transfer" && (item.trim() !== "" || categoryId !== null);
  const offerUse = type !== "transfer" && lookalikes.some((l) => l.adoptable);

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
  // While the warning is up, the button says what pressing it means.
  const buttonLabel = lookalikes.length > 0 ? `${verb} anyway` : verb;

  return (
    <form ref={formRef} action={formAction} className="card space-y-4">
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

      {lookalikes.length > 0 && (
        <div role="status" className="rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert size={16} aria-hidden /> Already in your books?
          </p>
          <p className="mt-1">
            Your bank import already has {lookalikes.length === 1 ? "an entry" : "entries"} for exactly this amount around this date.{" "}
            {offerUse
              ? "If it's the same purchase, use the bank's entry instead of adding it twice."
              : "If it's the same one, open it instead of adding it twice."}
          </p>
          <ul className="mt-1 divide-y divide-warn/25">
            {lookalikes.map((l) => (
              <li key={l.id} className="py-2">
                <span className="block truncate font-medium">{l.label}</span>
                <span className="block truncate text-xs opacity-80">
                  {l.where} · {shortDate(l.date)}
                  {l.bankText ? ` · ${l.bankText}` : ""}
                </span>
                <span className="mt-1 flex items-center gap-4">
                  {type !== "transfer" && l.adoptable && (
                    <button
                      type="button"
                      onClick={() => adopt(l.id)}
                      disabled={pending || !canAdopt}
                      className="inline-flex min-h-9 items-center rounded-lg bg-warn px-3 text-xs font-semibold text-background disabled:opacity-50"
                    >
                      Use this one
                    </button>
                  )}
                  <Link href={`/transactions/${l.id}`} className="inline-flex min-h-9 items-center text-xs font-semibold underline">
                    Open
                  </Link>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs opacity-80">
            {offerUse && !canAdopt
              ? `Pick a category, or say what it was, and "Use this one" puts it on the bank's entry.`
              : "A separate purchase for the same amount? Add it as normal."}
          </p>
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      {state.ok && !initial && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
          <Check size={16} className="mt-0.5 shrink-0" /> {state.message ?? "Saved"}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? <Loader2 size={18} className="animate-spin" /> : null}
        {buttonLabel}
      </button>
    </form>
  );
}
