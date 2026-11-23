"use client";

import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cardLook, CARD_NETWORKS, HEX, OTHER_NAME_MAX, parseMark } from "@/lib/card";
import type { AccountBalance } from "@/lib/queries/accounts";
import { AccountCard } from "./AccountCard";

/** Colours to pick from. "Automatic" is the bank's own colour (or plain), so most accounts need none of these. */
const SWATCHES = ["#b8890f", "#a82129", "#1e58b8", "#0f7a5a", "#6d3fc4", "#c2410c", "#334155", "#be185d"];

/**
 * Card settings: the card on top updates as you choose, then the mark, the colour, the last four digits and whether this
 * is the Main account. Plain controls submitting one form (`saveCardSettings`); a selection is a check as well as a
 * colour, never colour alone.
 */
export function CardForm({ account, action }: { account: AccountBalance; action: (fd: FormData) => void | Promise<void> }) {
  const initialMark = parseMark(account.cardNetwork);
  const [network, setNetwork] = useState<string>(initialMark ? (initialMark.kind === "other" ? "other" : initialMark.key) : "none");
  const [otherName, setOtherName] = useState(initialMark?.kind === "other" ? initialMark.name : "");
  const [color, setColor] = useState(account.cardColor && HEX.test(account.cardColor) ? account.cardColor.toLowerCase() : "");
  const [last4, setLast4] = useState(account.cardLast4 ?? "");
  const [main, setMain] = useState(account.purpose === "spending");

  const stored = network === "none" ? null : network === "other" ? (otherName.trim() ? `other:${otherName.trim()}` : null) : network;
  const preview: AccountBalance = {
    ...account,
    cardNetwork: stored,
    cardColor: color || null,
    cardLast4: /^\d{4}$/.test(last4) ? last4 : null,
    purpose: main ? "spending" : account.purpose === "spending" ? null : account.purpose,
  };
  const auto = cardLook({ name: account.name, cardColor: null }).bg;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={account.id} />
      <input type="hidden" name="network" value={network} />
      <input type="hidden" name="color" value={color} />
      <input type="hidden" name="main" value={main ? "1" : "0"} />
      <AccountCard account={preview} />

      <section className="card space-y-2.5" aria-labelledby="mark-h">
        <h2 id="mark-h" className="h2 mb-1">
          Mark
        </h2>
        <p className="sub">The small logo in the corner of the card. Pick the one on your actual card.</p>
        <div role="radiogroup" aria-label="Card mark" className="flex flex-wrap gap-2">
          {[{ key: "none", label: "None" }, ...CARD_NETWORKS, { key: "other", label: "Other…" }].map((n) => (
            <button key={n.key} type="button" role="radio" aria-checked={network === n.key} onClick={() => setNetwork(n.key)} className="chip">
              {network === n.key && <Check size={14} strokeWidth={3} aria-hidden />}
              {n.label}
            </button>
          ))}
        </div>
        {network === "other" && (
          <label className="block">
            <span className="label">Name on the card</span>
            <input name="otherName" value={otherName} onChange={(e) => setOtherName(e.target.value)} maxLength={OTHER_NAME_MAX} placeholder="e.g. Bank Islam" className="input" />
          </label>
        )}
      </section>

      <section className="card space-y-2.5" aria-labelledby="colour-h">
        <h2 id="colour-h" className="h2 mb-1">
          Colour
        </h2>
        <p className="sub">{auto ? "Maybank, CIMB and Touch 'n Go get their usual colour." : "Plain unless you pick a colour."} Pick one to override it.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={color === ""} onClick={() => setColor("")} className="chip">
            {color === "" && <Check size={14} strokeWidth={3} aria-hidden />}
            Automatic
          </button>
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              style={{ backgroundColor: c }}
              className="grid size-9 place-items-center rounded-full text-white ring-offset-2 ring-offset-card aria-pressed:ring-2 aria-pressed:ring-foreground"
            >
              {color === c && <Check size={16} strokeWidth={3} aria-hidden />}
            </button>
          ))}
          <label
            className={`relative grid size-9 cursor-pointer place-items-center rounded-full border border-dashed border-line text-muted ring-offset-2 ring-offset-card focus-within:outline-2 ${color && !SWATCHES.includes(color) ? "ring-2 ring-foreground" : ""}`}
            style={color && !SWATCHES.includes(color) ? { backgroundColor: color, borderStyle: "solid" } : undefined}
          >
            {color && !SWATCHES.includes(color) ? <Check size={16} strokeWidth={3} className="text-white" aria-hidden /> : <Plus size={16} aria-hidden />}
            <input type="color" value={color || "#334155"} onChange={(e) => setColor(e.target.value.toLowerCase())} aria-label="Custom colour" className="absolute inset-0 size-full cursor-pointer opacity-0" />
          </label>
        </div>
      </section>

      <section className="card space-y-3">
        <label className="block">
          <span className="label">Last four digits (optional)</span>
          <input name="last4" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" maxLength={4} placeholder="1234" className="input w-28" />
        </label>
        {account.type !== "investment" && (
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" checked={main} onChange={(e) => setMain(e.target.checked)} className="mt-1 size-5 accent-accent-strong" />
            <span>
              <span className="block text-sm font-extrabold">Main account</span>
              <span className="sub block">Where your salary lands and bills are paid from. Only one account is Main: choosing this one moves it.</span>
            </span>
          </label>
        )}
      </section>

      <div className="flex gap-2">
        <button className="btn-primary flex-1">Save</button>
        <Link href={`/accounts/${account.id}`} className="btn">
          Cancel
        </Link>
      </div>
    </form>
  );
}
