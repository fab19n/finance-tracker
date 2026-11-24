"use client";

import { ArrowRight, Info } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { ActionForm } from "@/components/ActionForm";
import { nextRadioIndex } from "@/components/entry/entry-logic";
import { SubmitButton } from "@/components/SubmitButton";
import { bankColor } from "@/lib/card";
import { parseSen } from "@/lib/money";
import type { AccountBalance } from "@/lib/queries/accounts";
import { AccountCard } from "./AccountCard";
import { Switch } from "./Switch";

const TYPES = [
  { key: "bank", label: "Bank" },
  { key: "ewallet", label: "E-wallet" },
  { key: "cash", label: "Cash" },
] as const;

/**
 * The New account page: a live plain card on top, then the name, the kind, the opening balance and the two roles. The card
 * starts plain (or in the bank's usual colour when the name is one the app knows); the mark and colour are chosen later in
 * Card settings. One form submitting `addAccount`.
 */
export function NewAccountForm({ action }: { action: (fd: FormData) => void | Promise<void> }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["key"]>("bank");
  const [opening, setOpening] = useState("");
  const [role, setRole] = useState<"spending" | "savings" | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function keyDown(e: KeyboardEvent, i: number) {
    const next = nextRadioIndex(e.key, i, TYPES.length);
    if (next === null) return;
    e.preventDefault();
    setType(TYPES[next].key);
    refs.current[next]?.focus();
  }

  const negative = opening.trim().startsWith("-");
  const sen = opening.trim() ? parseSen(opening.trim().replace(/^-/, "")) : 0;
  const preview: AccountBalance = {
    id: 0,
    name: name.trim() || "New account",
    type,
    openingBalance: 0,
    purpose: role,
    archived: false,
    cardNetwork: null,
    cardColor: null,
    cardLast4: null,
    sortOrder: 0,
    balance: sen === null ? 0 : negative ? -sen : sen,
    netTransferred: 0,
  };
  const known = !!name.trim() && bankColor(name) !== null;

  return (
    <ActionForm action={action} className="space-y-4">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="main" value={role === "spending" ? "1" : "0"} />
      <input type="hidden" name="savings" value={role === "savings" ? "1" : "0"} />
      <AccountCard account={preview} size="wide" />

      <label className="block">
        <span className="label">Name</span>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="off" placeholder="e.g. Public Bank" className="input" />
      </label>

      <div>
        <p id="type-h" className="label">
          Type
        </p>
        <div role="radiogroup" aria-labelledby="type-h" className="seg">
          {TYPES.map((t, i) => (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={type === t.key}
              tabIndex={type === t.key ? 0 : -1}
              onClick={() => setType(t.key)}
              onKeyDown={(e) => keyDown(e, i)}
              className="seg-item"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="label">Opening balance</span>
        <input name="openingBalance" value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="0.00" aria-invalid={sen === null || undefined} className="input" />
        <span className="sub mt-1 block">What is in it today, in ringgit. Entries you add or import move it from there.</span>
      </label>

      <section className="card !py-1" aria-label="Role">
        <Switch label="Main account" hint="Your salary lands here and bills are paid from it. Only one account can be Main." on={role === "spending"} onChange={(v) => setRole(v ? "spending" : null)} />
        <Switch label="Savings account" hint="Money set aside. Only one account can be Savings." on={role === "savings"} onChange={(v) => setRole(v ? "savings" : null)} divider />
      </section>

      <p className="banner banner-info">
        <Info size={18} aria-hidden />
        <span>
          {known
            ? `"${name.trim()}" has its usual colour. Pick a mark and a different colour in Card settings if you like.`
            : name.trim()
              ? `No bank colour matches "${name.trim()}", so it starts as a plain card. Pick a mark and a colour in Card settings.`
              : "A new account starts as a plain card. Pick a mark and a colour in Card settings afterwards."}
        </span>
      </p>

      <SubmitButton className="flex h-[54px] w-full items-center justify-between rounded-full bg-accent pl-[22px] pr-2 text-[15px] font-extrabold text-accent-fg transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50" pendingLabel="Adding…">
        Add account
        <span aria-hidden className="grid size-[38px] place-items-center rounded-full bg-accent-fg text-accent">
          <ArrowRight size={20} strokeWidth={2.4} />
        </span>
      </SubmitButton>
    </ActionForm>
  );
}
