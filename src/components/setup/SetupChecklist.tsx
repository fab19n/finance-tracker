"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { SETUP_SKIP_KEY, skipStillActive, type SetupStep } from "@/lib/setup";

type Item = { step: SetupStep; done: boolean };

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function skipped(): boolean {
  try {
    return skipStillActive(localStorage.getItem(SETUP_SKIP_KEY), Date.now());
  } catch {
    return false;
  }
}

/**
 * First-run card: the steps that make the app useful, each a link to the right Settings tab. "Skip for now" is remembered per
 * device for a week (localStorage; deliberately not in the database). The server renders it shown; a skipped device hides it after hydration.
 */
export function SetupChecklist({ items }: { items: Item[] }) {
  const hidden = useSyncExternalStore(subscribe, skipped, () => false);
  const remaining = items.filter((i) => !i.done);
  if (hidden || remaining.length === 0) return null;
  const next = remaining[0].step.id;
  return (
    <section className="card space-y-3" aria-labelledby="setup-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="setup-h" className="h2">
          Set up Koopang
        </h2>
        <span className="sub whitespace-nowrap">
          {items.length - remaining.length} of {items.length} done
        </span>
      </div>
      <ol className="space-y-1.5">
        {items.map(({ step, done }, n) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className={`flex min-h-11 items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-card-subtle ${step.id === next ? "bg-accent-soft" : ""}`}
            >
              <span
                aria-hidden
                className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-black ${done ? "bg-good-soft text-good" : "bg-card-subtle text-foreground"}`}
              >
                {done ? <Check size={14} strokeWidth={3} /> : n + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-[13px] font-extrabold ${done ? "text-muted line-through" : ""}`}>{step.title}</span>
                {!done && <span className="block text-[11px] font-bold leading-snug text-muted">{step.text}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn min-h-11"
        onClick={() => {
          try {
            localStorage.setItem(SETUP_SKIP_KEY, String(Date.now()));
          } catch {}
          listeners.forEach((l) => l());
        }}
      >
        Skip for now
      </button>
    </section>
  );
}
