"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { osPrefersDark, readTheme, setTheme, THEME_EVENT, type ThemeChoice } from "@/lib/theme";

const OPTIONS = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
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
 * Settings > Data > Appearance: System (follow this device's light/dark setting), Light, or Dark. The choice is kept on
 * THIS device (see src/lib/theme.ts) and applies at once with no Save button; it needs no connection to the PC, so unlike
 * the rest of Settings it works offline. The server render and first paint say "System" (it can't know), then the real
 * choice replaces it.
 */
export function AppearanceCard() {
  const choice = useSyncExternalStore(subscribe, readTheme, (): ThemeChoice => "system");
  const dark = useSyncExternalStore(subscribe, osPrefersDark, () => false);

  return (
    <section className="card space-y-3" aria-labelledby="appearance-h">
      <h2 id="appearance-h" className="text-[15px] font-bold">
        Appearance
      </h2>
      <div role="radiogroup" aria-labelledby="appearance-h" className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1">
        {OPTIONS.map(({ id, label, icon: Icon }) => {
          const on = choice === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTheme(id)}
              className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm transition ${
                on ? "bg-card font-bold text-foreground shadow-card ring-1 ring-line" : "font-medium text-muted hover:text-foreground"
              }`}
            >
              <Icon size={15} aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted">This device only. Your phone and your PC each keep their own choice.</p>
      <p className="text-sm font-semibold text-accent" aria-live="polite">
        {choice === "system" ? `System (currently ${dark ? "dark" : "light"})` : `Always ${choice} on this device`}
      </p>
    </section>
  );
}
