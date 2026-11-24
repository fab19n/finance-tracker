"use client";

import { ArrowRight, Check, ChevronDown, Info, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent } from "react";
import { adoptLookalike, saveTransaction, type FormState } from "@/app/actions/transactions";
import { AccountPicker, type PickableAccount } from "@/components/entry/AccountPicker";
import { CategoryPicker } from "@/components/entry/CategoryPicker";
import { dayChoice, largeAmountWarning, nextRadioIndex, quickHints, submitLabel } from "@/components/entry/entry-logic";
import { withBack } from "@/lib/back";
import { isISODate, shiftDays, shortDate, todayISO } from "@/lib/dates";
import { entryShapeError, savedMessage, type WireEntry } from "@/lib/entry-shape";
import { amountError, formatRM, parseSen } from "@/lib/money";
import { offlineStore } from "@/lib/offline/browser";
import { newClientId } from "@/lib/offline/ids";
import type { EntryLabels } from "@/lib/offline/types";
import type { Lookalike } from "@/lib/queries/lookalikes";

type TxType = "income" | "expense" | "transfer";
type Cat = { id: number; name: string; type: "income" | "expense"; color: string; icon: string };
type Acc = PickableAccount;
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
  /** With `initial`: the list the entry was opened from, where Save returns to. */
  backHref?: string;
  /** A NEW entry that starts as a copy of another ("Duplicate"): its fields, today's date, nothing shared with the original. */
  prefill?: Omit<TxInitial, "id" | "date">;
};
export type TransactionFormProps = Props;

const TYPE_LABEL: Record<TxType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

const subscribeNever = () => () => {};

/** What to say about an entry that is safe on the phone but hasn't reached the PC. */
function queuedMessage(why: "offline" | "unreachable" | "login" | "error"): string {
  if (why === "login") return "Saved on this phone. Sign in again and it will go to your PC.";
  if (why === "error") return "Saved on this phone. Your PC had a problem, so it will keep trying.";
  return "Saved on this phone. It is sent to your PC the next time you open the app with your PC reachable.";
}

export function TransactionForm({
  accounts,
  categories,
  hints,
  defaultDate,
  defaultAccountId,
  initial,
  backHref,
  draft,
  prefill,
}: Props) {
  const seed: (Omit<TxInitial, "id" | "date"> & { date?: string }) | undefined = initial ?? draft ?? prefill;
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
  // The result whose "Saved" notice the user has moved on from (any edit afterwards); the notice shows only for a newer one.
  const [seenResult, setSeenResult] = useState<FormState | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const typeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // The amount a very large entry was last warned about: pressing the button again with the SAME amount means "yes, it is".
  const largeAsked = useRef<string | null>(null);

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
    // "Use at most 2 decimals" and the like: say what is wrong with the typed amount, not a vague "greater than 0".
    const typed = String(fd.get("amount") ?? "");
    const badAmount = amountError(typed);
    if (badAmount) return { ok: false, error: badAmount };
    const entry: WireEntry = {
      clientId: draft?.clientId ?? newClientId(),
      type: kind,
      amount: parseSen(typed) ?? 0,
      date: String(fd.get("date") ?? ""),
      accountId: Number(fd.get("accountId")) || 0,
      toAccountId: kind === "transfer" ? Number(fd.get("toAccountId")) || null : null,
      categoryId: kind === "transfer" ? null : Number(fd.get("categoryId")) || null,
      item: String(fd.get("item") ?? "").trim().slice(0, 120) || null, // a transfer keeps its description too ("Payday move")
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
        return {
          ok: true,
          message: savedMessage({ type: entry.type, amount: entry.amount, category: labels.category, account: labels.account, toAccount: labels.toAccount }),
          nonce: Date.now(),
        };
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
      // A very large amount is usually a slipped decimal point: the first press says so, the second (same amount) goes ahead.
      if (!adopting) {
        const typed = String(fd.get("amount") ?? "").trim();
        const warning = largeAmountWarning(parseSen(typed));
        if (warning && largeAsked.current !== typed) {
          largeAsked.current = typed;
          return { ok: false, error: warning };
        }
      }
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
        largeAsked.current = null;
        // Back to the amount for the next entry, but only where there is a real keyboard: on a phone, focusing it would pop the
        // on-screen keyboard up over the button and the notice after every single entry.
        if (window.matchMedia("(pointer: fine)").matches) amountRef.current?.focus();
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
  const typeHints = hints.filter((h) => h.type === type);
  // Regular entries as one-tap starters (new entries only: a saved one already has its own values).
  const quick = initial || draft ? [] : quickHints(hints, type, chips.map((c) => c.id));

  function dismissSaved() {
    setSeenResult(state);
  }

  function changeAccount(id: number) {
    setAccountId(id);
    // "To" can't be the account the money leaves: move it to another one.
    if (toAccountId === id) setToAccountId(accounts.find((a) => a.id !== id)?.id ?? null);
  }

  function changeType(next: TxType) {
    if (next === type) return; // tapping the chosen type again must not wipe the category
    dismissSaved();
    setType(next);
    setCategoryId(null);
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

  /** A regular entry's chip: fills what it was, its category and the amount you last paid. */
  function applyQuick(h: (typeof quick)[number]) {
    dismissSaved();
    setItem(h.item);
    if (h.categoryId) setCategoryId(h.categoryId);
    setAmount((h.amount / 100).toFixed(2));
  }

  function typeKeyDown(e: KeyboardEvent, index: number) {
    const types = Object.keys(TYPE_LABEL) as TxType[];
    const next = nextRadioIndex(e.key, index, types.length);
    if (next === null) return;
    e.preventDefault();
    changeType(types[next]);
    typeRefs.current[next]?.focus();
  }

  function changeItem(value: string) {
    setItem(value);
    const match = typeHints.find((h) => h.item.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      if (match.categoryId) setCategoryId(match.categoryId);
      setAmount((cur) => (cur ? cur : (match.amount / 100).toFixed(2)));
    }
  }

  const buttonLabel = submitLabel({ editing: !!initial, correcting: !!draft, type, sen, anyway: lookalikes.length > 0 });
  const dayPicked = dayChoice(date, today);
  const toAccounts = accounts.filter((a) => a.id !== accountId);
  const showSaved = state.ok && !initial && seenResult !== state;
  // A refusal belongs to what was typed when it came back: once anything is edited it is stale, like the Saved notice.
  const showError = !!state.error && seenResult !== state;

  return (
    // An edit anywhere in the form starts a new entry in the user's mind: the "Saved" notice from the last one goes.
    <form ref={formRef} action={formAction} onChange={dismissSaved} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {initial && backHref && <input type="hidden" name="back" value={backHref} />}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="categoryId" value={categoryId ?? ""} />

      {draft && (
        <div className="banner banner-warn flex-col gap-0.5 !items-start">
          <p className="font-extrabold">{draft.error ? "Correcting an entry your PC didn't accept" : "Editing an entry waiting to be sent"}</p>
          {draft.error && <p>{draft.error}</p>}
          <button type="button" className="mt-1 inline-flex min-h-11 items-center text-xs font-extrabold underline" onClick={() => offlineStore().cancelEdit()}>
            Cancel
          </button>
        </div>
      )}

      {showSaved && (
        <p role="status" className="banner banner-good font-extrabold">
          <Check size={16} className="mt-0.5 shrink-0" /> {state.message ?? "Saved"}
        </p>
      )}

      {/* One choice out of three, so a radio group: Tab lands on the chosen one and the arrow keys move the choice. */}
      <div className="seg" role="radiogroup" aria-label="Entry type">
        {(Object.keys(TYPE_LABEL) as TxType[]).map((t, i) => (
          <button
            key={t}
            ref={(el) => {
              typeRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={type === t}
            tabIndex={type === t ? 0 : -1}
            onClick={() => changeType(t)}
            onKeyDown={(e) => typeKeyDown(e, i)}
            className="seg-item"
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {quick.length > 0 && (
        <div role="group" aria-label="Your regular entries: tap one to fill in what it was, the category and the amount" className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:px-0">
          {quick.map((h) => (
            <button key={h.item} type="button" onClick={() => applyQuick(h)} aria-pressed={item.trim().toLowerCase() === h.item.toLowerCase() && sen === h.amount} className="chip">
              {h.item}
              <span className="num font-semibold opacity-80">{formatRM(h.amount)}</span>
            </button>
          ))}
        </div>
      )}

      <div>
        <label htmlFor="amount" className="sr-only">
          Amount
        </label>
        <div className="flex items-baseline gap-2 border-b-[1.5px] border-line px-1 pb-1 focus-within:border-accent-strong">
          <span className="text-sm font-bold text-muted">RM</span>
          <input
            ref={amountRef}
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="num font-display w-full bg-transparent text-[54px] font-semibold leading-[1.05] tracking-[-0.02em] outline-none placeholder:text-muted/60"
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="item" className="label">
          Description{type !== "transfer" && <span className="font-semibold"> (what was it? helps find leaks)</span>}
        </label>
        <input
          id="item"
          name="item"
          list="item-hints"
          autoComplete="off"
          placeholder={type === "expense" ? "e.g. teh tarik, Grab, Netflix" : type === "income" ? "e.g. March salary" : "e.g. Top up eWallet"}
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

      <AccountPicker
        legend={type === "transfer" ? "From" : type === "income" ? "Into" : "Paid from"}
        name="accountId"
        accounts={fromAccounts}
        value={accountId}
        onChange={changeAccount}
      />

      {type === "transfer" && (
        <>
          <ChevronDown size={22} aria-hidden className="mx-auto -my-1 text-muted" />
          <AccountPicker legend="To" name="toAccountId" accounts={toAccounts} value={toAccountId} onChange={(id) => setToAccountId(id)} />
          <p className="banner banner-info">
            <Info size={16} aria-hidden className="mt-0.5 shrink-0" />
            Moving money between your own accounts (ATM withdrawal, top-up, investing) is not spending.
          </p>
        </>
      )}

      {type !== "transfer" && (
        <CategoryPicker
          key={type}
          categories={chips}
          value={categoryId}
          onChange={(id) => {
            setCategoryId(id);
            dismissSaved();
          }}
        />
      )}

      <div>
        <label htmlFor="date" className="label">
          Date
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="chip min-h-11"
            aria-pressed={dayPicked === "today"}
            onClick={() => {
              setPickedDate(today);
              dismissSaved();
            }}
          >
            Today
          </button>
          <button
            type="button"
            className="chip min-h-11"
            aria-pressed={dayPicked === "yesterday"}
            onClick={() => {
              setPickedDate(shiftDays(today, -1));
              dismissSaved();
            }}
          >
            Yesterday
          </button>
          <input
            id="date"
            name="date"
            type="date"
            value={date}
            onChange={(e) => setPickedDate(e.target.value)}
            className="input min-h-11 min-w-0 flex-1"
            required
          />
        </div>
      </div>

      <details className="text-[13px]" open={!!seed?.note}>
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center font-bold text-muted [&::-webkit-details-marker]:hidden">+ Add a note</summary>
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
                      className="pill min-h-11 bg-warn px-4 text-card disabled:opacity-50"
                    >
                      Use this one
                    </button>
                  )}
                  {/* A new tab, so what is typed here is not lost; the bank's entry comes back to this page. */}
                  <Link
                    href={withBack(`/transactions/${l.id}`, "/")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center text-xs font-extrabold text-accent-strong underline"
                  >
                    Open<span className="sr-only"> (opens in a new tab)</span>
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

      {/* The docked button: sticky above the tab bar (about 100 px) and its raised Add button, inside the form so Enter in any
          field still submits. A refusal shows right above it, where it can't be scrolled away from the button that caused it. */}
      <div className="sticky bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-10 -mx-1 space-y-2 bg-gradient-to-t from-background from-70% to-transparent px-1 pt-4 md:bottom-4">
        {showError && (
          <p role="alert" className="banner banner-danger leading-snug">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="flex h-[54px] w-full items-center justify-between gap-3 rounded-full bg-accent pl-[22px] pr-2 text-[15px] font-extrabold text-accent-fg shadow-[inset_0_0_0_1.5px_var(--accent-strong)] transition active:scale-[0.99] disabled:opacity-60"
        >
          <span className="num truncate">{buttonLabel}</span>
          <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-accent-fg text-accent" aria-hidden>
            {pending ? <Loader2 size={18} strokeWidth={3} className="animate-spin" /> : <ArrowRight size={18} strokeWidth={2.5} />}
          </span>
        </button>
      </div>
    </form>
  );
}
