"use client";

import { useRef, useSyncExternalStore } from "react";
import { nextRadioIndex } from "@/components/entry/entry-logic";
import { osPrefersDark, readTheme, setTheme, THEME_EVENT, type ThemeChoice } from "@/lib/theme";

const OPTIONS = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

/** Re-read when this tab changes the theme, another tab does, or the OS flips between light and dark. */
function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    media.removeEventListener("change", onChange);
  };
}

/**
 * Settings > Appearance & data > Appearance: System (follow this device's light/dark setting), Light, or Dark. The choice is
 * kept on THIS device (see src/lib/theme.ts) and applies at once with no Save button; it needs no connection to the PC, so
 * unlike the rest of Settings it works offline. The server render and first paint say "System" (it can't know), then the
 * real choice replaces it.
 */
export function AppearanceCard() {
  const choice = useSyncExternalStore(subscribe, readTheme, (): ThemeChoice => "system");
  const dark = useSyncExternalStore(subscribe, osPrefersDark, () => false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  // A radio group: one stop in the Tab order (the chosen one), the arrow keys move and choose, Home and End jump.
  function onKey(e: React.KeyboardEvent, index: number) {
    const next = nextRadioIndex(e.key, index, OPTIONS.length);
    if (next === null) return;
    e.preventDefault();
    setTheme(OPTIONS[next].id);
    buttons.current[next]?.focus();
  }

  return (
    <section className="card space-y-3" aria-labelledby="appearance-h">
      <div>
        <h2 id="appearance-h" className="h2">
          Theme on this device
        </h2>
        <p className="sub mt-1">Applies instantly. Works without your PC.</p>
      </div>
      <div role="radiogroup" aria-labelledby="appearance-h" className="seg">
        {OPTIONS.map(({ id, label }, i) => (
          <button
            key={id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={choice === id}
            tabIndex={choice === id ? 0 : -1}
            onClick={() => setTheme(id)}
            onKeyDown={(e) => onKey(e, i)}
            className="seg-item"
          >
            {label}
          </button>
        ))}
      </div>
      <p className="sub">This device only. Your phone and your PC each keep their own choice.</p>
      <p className="text-xs font-extrabold text-accent-strong" aria-live="polite">
        {choice === "system" ? `System (currently ${dark ? "dark" : "light"})` : `Always ${choice} on this device`}
      </p>
    </section>
  );
}
