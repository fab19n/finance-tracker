/**
 * Theme choice, kept on THIS device only (localStorage): the phone and the PC share one database, and the owner may want
 * a different theme on each, so it is deliberately not a setting stored there.
 *
 *   system (nothing stored)  follow the OS: globals.css switches on prefers-color-scheme
 *   light | dark             forced: <html data-theme="..."> overrides the OS
 *
 * The attribute is set BEFORE first paint by THEME_SCRIPT (an inline script in the root layout's <head>, the pattern in
 * Next's "preventing flash before hydration" guide), so a forced theme never flashes the wrong one.
 */
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "mt-theme";
export const THEME_EVENT = "mt-theme-change";

/** The page background of each theme: the browser's theme colour (the phone's status bar) follows the active theme. */
export const THEME_COLORS = { light: "#f0faf5", dark: "#0b1210" } as const;

/** Runs in <head>, before paint. Must stay tiny, dependency-free and silent when storage is unavailable. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

function isChoice(v: unknown): v is "light" | "dark" {
  return v === "light" || v === "dark";
}

/** What this device has chosen. Safe on the server and when storage is blocked (private windows): both give "system". */
export function readTheme(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return isChoice(v) ? v : "system";
  } catch {
    return "system";
  }
}

/** Whether the OS currently prefers dark (only meaningful on the client). */
export function osPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** The theme actually showing right now. */
export function resolvedTheme(choice: ThemeChoice): "light" | "dark" {
  return choice === "system" ? (osPrefersDark() ? "dark" : "light") : choice;
}

/**
 * Put the attribute and the browser's theme colour in line with a choice. The <meta name="theme-color"> tags Next writes
 * carry OS media queries, which can't follow a forced theme: for a forced theme they get that theme's colour and lose
 * their media query; for "system" they get both back (the originals are remembered on first touch).
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);

  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (meta.dataset.mtContent === undefined) {
      meta.dataset.mtContent = meta.getAttribute("content") ?? "";
      meta.dataset.mtMedia = meta.getAttribute("media") ?? "";
    }
    if (choice === "system") {
      meta.setAttribute("content", meta.dataset.mtContent);
      if (meta.dataset.mtMedia) meta.setAttribute("media", meta.dataset.mtMedia);
    } else {
      meta.setAttribute("content", THEME_COLORS[choice]);
      meta.removeAttribute("media");
    }
  }
}

/** Remember a choice on this device, apply it, and tell anything on screen that shows it. */
export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies until the page is closed.
  }
  applyTheme(choice);
  window.dispatchEvent(new Event(THEME_EVENT));
}
