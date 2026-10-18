"use client";

import { Check, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { adoptLookalike, saveTransaction, type FormState } from "@/app/actions/transactions";
import { isISODate, shortDate, todayISO } from "@/lib/dates";
import { entryShapeError, type WireEntry } from "@/lib/entry-shape";
import { parseSen } from "@/lib/money";
import { offlineStore } from "@/lib/offline/browser";
import { newClientId } from "@/lib/offline/ids";
import type { EntryLabels } from "@/lib/offline/types";
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

/** An entry waiting in the phone's outbox, loaded back into the form to be corrected and sent again. */
export type EntryDraft = Omit<TxInitial, "id"> & {
  /** The outbox entry this replaces: the same entry, so correcting it can never make a second one. */
  clientId: string;
  /** Why the PC refused it, if it did. */
  error: string | null;
};

type Props = {
  accounts: Acc[];
  categories: Cat[];
  hints: Hint[];
  defaultDate: string;
  defaultAccountId: number;
  /** An existing entry on the PC being edited (this form then saves straight to the PC, and needs it). */
  initial?: TxInitial;
  /** An outbox entry being corrected. Never together with `initial`. */
  draft?: EntryDraft;
};
export type TransactionFormProps = Props;

const TYPE_LABEL: Record<TxType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

const VISIBLE_CHIPS = 9;

const subscribeNever = () => () => {};

/** What to say about an entry that is safe on the phone but hasn't reached the PC. */
function queuedMessage(why: "offline" | "unreachable" | "login" | "error"): string {
  if (why === "login") return "Saved on this phone. Sign in again and it will go to your PC.";
  if (why === "error") return "Saved on this phone. Your PC had a problem, so it will keep trying.";
  return "Saved on this phone. It will go to your PC as soon as it can be reached.";
}

export function TransactionForm({
  accounts,
  categories,
  hints,
  defaultDate,
  defaultAccountId,
  initial,
  draft,
}: Props) {
  const seed = initial ?? draft;
  const [type, setType] = useState<TxType>(seed?.type ?? "expense");
  const [amount, setAmount] = useState(seed ? (seed.amount / 100).toFixed(2) : "");
  const [categoryId, setCategoryId] = useState<number | null>(seed?.categoryId ?? null);
  const [item, setItem] = useState(seed?.item ?? "");
  const [note, setNote] = useState(seed?.note ?? "");
  const [accountId, setAccountId] = useState<number>(seed?.accountId ?? defaultAccountId);
  const [toAccountId, setToAccountId] = useState<number | null>(seed?.toAccountId ?? null);
  // The date you picked, if you picked one; otherwise today, read from THIS device's clock. A page the phone saved
  // yesterday says yesterday in `defaultDate`, and an entry made today must not be dated then.
  const [pickedDate, setPickedDate] = useState<string | null>(seed?.date ?? null);
  const today = useSyncExternalStore(subscribeNever, todayISO, () => defaultDate);
  const date = pickedDate ?? today;
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

  /**
   * A NEW entry. It goes through the phone's outbox (src/lib/offline): kept on the phone first, then sent to the PC, and if
   * the PC can't be reached it simply stays there and goes later. The PC still has the last word: it checks the entry
   * exactly as it checks one from the old form, and its "no" comes straight back here, with the form still filled in.
   */
  async function addEntry(fd: FormData, prev: FormState): Promise<FormState> {
    const kind = String(fd.get("type")) as TxType;
    const entry: WireEntry = {
      clientId: draft?.clientId ?? newClientId(),
      type: kind,
      amount: parseSen(String(fd.get("amount") ?? "")) ?? 0,
      date: String(fd.get("date") ?? ""),
      accountId: Number(fd.get("accountId")) || 0,
      toAccountId: kind === "transfer" ? Number(fd.get("toAccountId")) || null : null,
      categoryId: kind === "transfer" ? null : Number(fd.get("categoryId")) || null,
      item: kind === "transfer" ? null : String(fd.get("item") ?? "").trim().slice(0, 120) || null,
      note: String(fd.get("note") ?? "").trim().slice(0, 500) || null,
    };
    const problem = entryShapeError(entry);
    if (problem) return { ok: false, error: problem };

    const accountName = (id: number | null) => accounts.find((a) => a.id === id)?.name ?? "an account";
    const category = categories.find((c) => c.id === entry.categoryId);
    const labels: EntryLabels = {
      account: accountName(entry.accountId),
      toAccount: entry.toAccountId ? accountName(entry.toAccountId) : null,
      category: category?.name ?? null,
      icon: category?.icon ?? null,
    };
    const store = offlineStore();
    const outcome = draft ? await store.update(draft.clientId, entry, labels) : await store.submit(entry, labels);
    switch (outcome.kind) {
      case "saved":
        return { ok: true, message: "Saved", nonce: Date.now() };
      case "queued":
        return { ok: true, message: queuedMessage(outcome.why), nonce: Date.now() };
      case "rejected":
        return { ok: false, error: outcome.error };
      case "unavailable":
        return saveTransaction(prev, fd); // this browser can't keep an outbox: save straight to the PC, as before
    }
  }

  // Wrap the actions so a successful *create* (or "use the bank's entry") clears the form for the next entry.
  // One reducer for all of them, so they share one pending flag and one place for the result: a message from one can
  // never linger beside the other's.
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, fd) => {
      const adopting = fd.has("adopt");
      let result: FormState;
      try {
        if (adopting) result = await adoptLookalike(prev, fd);
        else if (initial) result = await saveTransaction(prev, fd);
        else result = await addEntry(fd, prev);
      } catch (error) {
        // A failed fetch is a TypeError in every browser. That is the PC being unreachable (asleep, or Tailscale off on this
        // phone), not a bug: say so, and keep what was typed so trying again is one tap. Anything else (and the redirect that
        // finishes an edit, which Next handles itself) behaves exactly as before.
        if (!(error instanceof TypeError)) throw error;
        const retry = "Check that it's on and Tailscale is connected, then try again.";
        return {
          ok: false,
          error: adopting
            ? `Couldn't reach your PC, so nothing was changed. ${retry}`
            : initial
              ? `Couldn't reach your PC. A saved entry can only be changed while it can be reached, so nothing was changed. ${retry}`
              : `Couldn't reach your PC, so nothing was saved. ${retry}`,
        };
      }
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

  const verb = initial ? "Save changes" : draft ? "Save and send" : type === "expense" ? "Add expense" : type === "income" ? "Add income" : "Add transfer";
  // While the warning is up, the button says what pressing it means.
  const buttonLabel = lookalikes.length > 0 ? `${verb} anyway` : verb;

  return (
    <form ref={formRef} action={formAction} className="card space-y-3.5">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="categoryId" value={categoryId ?? ""} />

      {draft && (
        <div className="banner banner-warn flex-col gap-0.5 !items-start">
          <p className="font-extrabold">{draft.error ? "Correcting an entry your PC didn't accept" : "Editing an entry waiting to be sent"}</p>
          {draft.error && <p>{draft.error}</p>}
          <button type="button" className="mt-1 text-xs font-extrabold underline" onClick={() => offlineStore().cancelEdit()}>
            Cancel
          </button>
        </div>
      )}

      <div className="seg" role="tablist">
        {(Object.keys(TYPE_LABEL) as TxType[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={type === t} onClick={() => changeType(t)} className="seg-item">
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="amount" className="label">
          Amount
        </label>
        <div className="flex items-baseline gap-2 rounded-[18px] border-[1.5px] border-line bg-background px-4 py-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
          <span className="text-base font-extrabold text-muted">RM</span>
          <input
            ref={amountRef}
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="num w-full bg-transparent text-4xl font-black tracking-[-0.03em] outline-none"
            required
          />
        </div>
      </div>

      {type !== "transfer" && (
        <div>
          <span className="label">Category</span>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
            {shownChips.map((c) => {
              const selected = categoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  aria-pressed={selected}
                  className={`relative flex min-h-[60px] flex-col items-center justify-center gap-[5px] rounded-2xl border-[1.5px] px-2 py-2.5 text-center text-[11px] font-extrabold leading-tight transition active:scale-95 ${
                    selected ? "border-foreground bg-nav-active" : "border-transparent bg-card-subtle"
                  }`}
                >
                  {/* Selected = a filled tile with a dark border AND a check, so it never relies on colour alone. The
                      category's own colour is only the dot. */}
                  {selected && (
                    <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-foreground text-background" aria-hidden>
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                  {c.name}
                </button>
              );
            })}
          </div>
          {chips.length > VISIBLE_CHIPS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-xs font-extrabold text-accent-strong"
            >
              {showAll ? "Show fewer" : `Show all ${chips.length} categories →`}
            </button>
          )}
        </div>
      )}

      {type !== "transfer" && (
        <div>
          <label htmlFor="item" className="label">
            What exactly? <span className="font-semibold">(item - helps find leaks)</span>
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

      <div className="grid grid-cols-2 gap-2.5">
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
              onChange={(e) => setPickedDate(e.target.value)}
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
            onChange={(e) => setPickedDate(e.target.value)}
            className="input"
            required
          />
          <p className="sub mt-2">Moving money between your own accounts (ATM withdrawal, top-up, investing) is not spending.</p>
        </div>
      )}

      <details className="text-[13px]" open={!!seed?.note}>
        <summary className="cursor-pointer list-none font-bold text-muted [&::-webkit-details-marker]:hidden">+ Add a note</summary>
        <input
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional"
          className="input mt-2"
        />
      </details>

      {lookalikes.length > 0 && (
        <div role="status" className="rounded-[18px] bg-warn-soft p-3.5 text-warn">
          <p className="flex items-center gap-2 text-[13px] font-black">
            <TriangleAlert size={16} aria-hidden /> Already in your books?
          </p>
          <p className="mt-1 text-xs font-semibold leading-snug">
            Your bank import already has {lookalikes.length === 1 ? "an entry" : "entries"} for exactly this amount around this date.{" "}
            {offerUse
              ? "If it's the same purchase, use the bank's entry instead of adding it twice."
              : "If it's the same one, open it instead of adding it twice."}
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {lookalikes.map((l) => (
              <li key={l.id} className="rounded-2xl bg-card px-3 py-2.5 text-foreground">
                <span className="block truncate text-xs font-extrabold">{l.label}</span>
                <span className="sub block truncate !text-[11px]">
                  {l.where} · {shortDate(l.date)}
                  {l.bankText ? ` · ${l.bankText}` : ""}
                </span>
                <span className="mt-1.5 flex items-center gap-4">
                  {type !== "transfer" && l.adoptable && (
                    <button
                      type="button"
                      onClick={() => adopt(l.id)}
                      disabled={pending || !canAdopt}
                      className="pill min-h-8 bg-warn px-3.5 text-card disabled:opacity-50"
                    >
                      Use this one
                    </button>
                  )}
                  <Link href={`/transactions/${l.id}`} className="inline-flex min-h-8 items-center text-xs font-extrabold text-accent-strong underline">
                    Open
                  </Link>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs font-semibold">
            {offerUse && !canAdopt
              ? `Pick a category, or say what it was, and "Use this one" puts it on the bank's entry.`
              : "A separate purchase for the same amount? Add it as normal."}
          </p>
        </div>
      )}

      {state.error && (
        <p role="alert" className="banner banner-danger leading-snug">
          {state.error}
        </p>
      )}
      {state.ok && !initial && (
        <p role="status" className="banner banner-good font-extrabold">
          <Check size={16} className="mt-0.5 shrink-0" /> {state.message ?? "Saved"}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full !py-3.5">
        {pending ? <Loader2 size={16} strokeWidth={3} className="animate-spin" /> : null}
        {buttonLabel}
      </button>
    </form>
  );
}
