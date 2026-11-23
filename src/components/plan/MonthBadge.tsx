import { Check, X } from "lucide-react";

export type BadgeKind = "paid" | "part" | "unpaid" | "advance" | "later" | "you" | "open";

const CLASS: Record<BadgeKind, string> = {
  paid: "mk-paid",
  part: "mk-part",
  unpaid: "mk-unpaid",
  advance: "mk-advance",
  later: "mk-later",
  you: "mk-you",
  open: "mk-open",
};

/**
 * One month for one person in the shared-bill grid: a 24px round badge (the design's). Colour is never the only signal:
 * each state has its own glyph (check, half, cross, dashed ring, plain ring, "you", "?") and a text label for screen
 * readers and hover.
 */
export function MonthBadge({ kind, label, small }: { kind: BadgeKind; label: string; small?: boolean }) {
  const size = small ? 10 : 13;
  return (
    <span role="img" aria-label={label} title={label} className={`mk ${CLASS[kind]}${small ? " mk-key" : ""}`}>
      {kind === "paid" && <Check size={size} strokeWidth={3.2} aria-hidden />}
      {kind === "advance" && <Check size={size} strokeWidth={3.2} aria-hidden />}
      {kind === "part" && <span aria-hidden>½</span>}
      {kind === "unpaid" && <X size={size} strokeWidth={3.2} aria-hidden />}
      {kind === "you" && <span aria-hidden>you</span>}
      {kind === "open" && <span aria-hidden>?</span>}
    </span>
  );
}

/** A month that does not apply to this person (not sharing yet, or not their turn): a quiet dot. */
export function NoMonth({ label }: { label: string }) {
  return (
    <span role="img" aria-label={label} title={label} className="mk text-muted/40">
      ·
    </span>
  );
}
