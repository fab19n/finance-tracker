"use client";

import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { ActionForm } from "@/components/ActionForm";
import { nextRadioIndex } from "@/components/entry/entry-logic";
import { SubmitButton } from "@/components/SubmitButton";
import { cardLook, CARD_NETWORKS, HEX, OTHER_NAME_MAX, parseMark, textOn } from "@/lib/card";
import type { AccountBalance } from "@/lib/queries/accounts";
import { AccountCard } from "./AccountCard";
import { Switch } from "./Switch";

/**
 * The card colours the board offers: Maybank's gold, CIMB's red, Touch 'n Go's blue, a deep green and paper. "Automatic"
 * is the bank's own colour (or plain), so most accounts need none of these; "+" and the hex box take any other.
 */
const PRESETS = ["#b8890f", "#a82129", "#1e58b8", "#1e302b", "#fffaf0"];

/**
 * Card settings, one flat page like the board: the card on top updates as you choose, then the Main and Savings switches,
 * the mark, the colour (presets, a colour picker and a hex box), and the last four digits. Plain controls submitting one
 * form (`saveCardSettings`); a selection is a check as well as a colour, never colour alone. The name is edited in
 * Settings (this action doesn't rename), and so are the opening balance and archiving.
 */
export function CardForm({ account, action }: { account: AccountBalance; action: (fd: FormData) => void | Promise<void> }) {
  const initialMark = parseMark(account.cardNetwork);
  const [network, setNetwork] = useState<string>(initialMark ? (initialMark.kind === "other" ? "other" : initialMark.key) : "none");
  const [otherName, setOtherName] = useState(initialMark?.kind === "other" ? initialMark.name : "");
  const [color, setColor] = useState(account.cardColor && HEX.test(account.cardColor) ? account.cardColor.toLowerCase() : "");
  const [hexText, setHexText] = useState(color);
  const [last4, setLast4] = useState(account.cardLast4 ?? "");
  const [role, setRole] = useState<"spending" | "savings" | null>(account.purpose);
  const markRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // "None" ends the list, as the board has it.
  const marks = [...CARD_NETWORKS, { key: "other", label: "Other…" }, { key: "none", label: "None" }];
  // A radio group: Tab lands on the chosen mark, the arrow keys move the choice.
  function markKeyDown(e: KeyboardEvent, index: number) {
    const next = nextRadioIndex(e.key, index, marks.length);
    if (next === null) return;
    e.preventDefault();
    setNetwork(marks[next].key);
    markRefs.current[next]?.focus();
  }
  function pick(c: string) {
    setColor(c);
    setHexText(c);
  }

  const stored = network === "none" ? null : network === "other" ? (otherName.trim() ? `other:${otherName.trim()}` : null) : network;
  const preview: AccountBalance = {
    ...account,
    cardNetwork: stored,
    cardColor: color || null,
    cardLast4: /^\d{4}$/.test(last4) ? last4 : null,
    purpose: role,
  };
  const auto = cardLook({ name: account.name, cardColor: null }).bg;
  const isPreset = PRESETS.includes(color);
  const hexBad = hexText !== "" && !HEX.test(hexText);
  const canHaveRole = account.type !== "investment";

  return (
    <ActionForm action={action} className="space-y-4">
      <input type="hidden" name="id" value={account.id} />
      <input type="hidden" name="network" value={network} />
      <input type="hidden" name="color" value={color} />
      {canHaveRole && <input type="hidden" name="main" value={role === "spending" ? "1" : "0"} />}
      {canHaveRole && <input type="hidden" name="savings" value={role === "savings" ? "1" : "0"} />}
      <AccountCard account={preview} size="wide" />

      {canHaveRole && (
        <section className="card !py-1" aria-label="Role">
          <Switch
            label="Main account"
            hint="Your salary lands here and bills are paid from it. Only one account can be Main: choosing this one moves it."
            on={role === "spending"}
            onChange={(v) => setRole(v ? "spending" : null)}
          />
          <Switch
            label="Savings account"
            hint="Money set aside. Only one account can be Savings. An account is Main or Savings, not both."
            on={role === "savings"}
            onChange={(v) => setRole(v ? "savings" : null)}
            divider
          />
        </section>
      )}

      <div>
        <p id="mark-h" className="label">
          Card mark
        </p>
        <div role="radiogroup" aria-labelledby="mark-h" className="flex flex-wrap gap-2">
          {marks.map((n, i) => (
            <button
              key={n.key}
              ref={(el) => {
                markRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={network === n.key}
              tabIndex={network === n.key ? 0 : -1}
              onClick={() => setNetwork(n.key)}
              onKeyDown={(e) => markKeyDown(e, i)}
              className="chip"
            >
              {network === n.key && <Check size={14} strokeWidth={3} aria-hidden />}
              {n.label}
            </button>
          ))}
        </div>
        {network === "other" && (
          <label className="mt-3 block">
            <span className="label">Mark name</span>
            <input name="otherName" value={otherName} onChange={(e) => setOtherName(e.target.value)} maxLength={OTHER_NAME_MAX} placeholder="e.g. Bank Islam" className="input" />
            <span className="sub mt-1 block">Shown as a small badge on the card. (Logos can&apos;t be added yet.)</span>
          </label>
        )}
      </div>

      <div>
        <p id="colour-h" className="label">
          Card colour
        </p>
        <p className="sub mb-2">{auto ? "Maybank, CIMB and Touch 'n Go get their usual colour." : "Plain unless you pick a colour."} Pick one to override it.</p>
        <div role="group" aria-labelledby="colour-h" className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={color === ""} onClick={() => pick("")} className="chip">
            {color === "" && <Check size={14} strokeWidth={3} aria-hidden />}
            Automatic
          </button>
          {PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              onClick={() => pick(c)}
              style={{ backgroundColor: c, color: textOn(c) }}
              className="grid size-11 place-items-center rounded-full border-2 border-line ring-offset-2 ring-offset-background aria-pressed:border-foreground aria-pressed:ring-2 aria-pressed:ring-foreground"
            >
              {color === c && <Check size={16} strokeWidth={3} aria-hidden />}
            </button>
          ))}
          <label
            className={`relative grid size-11 cursor-pointer place-items-center rounded-full border-2 border-dashed border-muted text-muted ring-offset-2 ring-offset-background focus-within:outline-2 ${color && !isPreset ? "ring-2 ring-foreground" : ""}`}
            style={color && !isPreset ? { backgroundColor: color, borderStyle: "solid", color: textOn(color) } : undefined}
          >
            {color && !isPreset ? <Check size={16} strokeWidth={3} aria-hidden /> : <Plus size={18} aria-hidden />}
            <input type="color" value={color || "#334155"} onChange={(e) => pick(e.target.value.toLowerCase())} aria-label="Pick your own colour" className="absolute inset-0 size-full cursor-pointer opacity-0" />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="label">Custom colour</span>
          <span className="flex items-center gap-2">
            <input
              value={hexText}
              onChange={(e) => {
                const v = e.target.value.trim();
                setHexText(v);
                if (HEX.test(v)) setColor(v.toLowerCase());
                else if (v === "") setColor("");
              }}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={7}
              placeholder="#e8731f"
              aria-invalid={hexBad || undefined}
              aria-describedby={hexBad ? "hex-err" : undefined}
              className="input w-36"
            />
            <span aria-hidden className="size-6 shrink-0 rounded-full border border-line" style={{ backgroundColor: color || undefined }} />
          </span>
          {hexBad && (
            <span id="hex-err" role="alert" className="sub mt-1 block text-danger">
              Six digits after the #, like #e8731f. Until then the card keeps its last colour.
            </span>
          )}
        </label>
      </div>

      <label className="block">
        <span className="label">Last four digits (optional)</span>
        <input name="last4" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" maxLength={4} placeholder="1234" className="input w-28" />
      </label>

      <div className="flex gap-2">
        <SubmitButton className="btn-primary flex-1" pendingLabel="Saving…" disabled={hexBad}>
          Save
        </SubmitButton>
        <Link href={`/accounts/${account.id}`} className="btn">
          Cancel
        </Link>
      </div>
    </ActionForm>
  );
}
