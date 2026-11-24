/**
 * What this phone is holding for the app, in words. Pure (no browser access), so it is tested in plain Node; the card in
 * Settings (src/components/offline/ThisPhoneCard.tsx) reads the real storage and hands the facts here.
 */

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago": how old something saved on this phone is. */
export function ageLabel(at: number, now: number): string {
  const ms = Math.max(0, now - at);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** The pages that can be saved, in the order the card lists them, with the name the app uses for each. */
const NAMES: [string, string][] = [
  ["/", "Add"],
  ["/transactions", "Activity"],
  ["/dashboard", "Home"],
  ["/accounts", "Accounts"],
  ["/plan", "Plan"],
  ["/plan/bills", "Bills"],
  ["/plan/shared", "Shared bills"],
  ["/more", "More"],
  ["/insights", "Insights"],
  ["/invest", "Invest"],
  ["/settings", "Settings"],
];

const SETTINGS_TAB_NAMES: Record<string, string> = {
  accounts: "Accounts",
  categories: "Categories",
  payday: "Payday",
  investing: "Investing",
  data: "Appearance & data",
};

/** A saved address as a person would say it ("/settings?tab=data" is "Settings: Appearance & data"), or null for one the app doesn't list. */
export function savedPageName(key: string): string | null {
  const [path, query = ""] = key.split("?");
  if (path === "/settings") {
    const tab = new URLSearchParams(query).get("tab");
    if (!tab) return "Settings";
    const name = SETTINGS_TAB_NAMES[tab];
    return name ? `Settings: ${name}` : null;
  }
  if (query) return null;
  return NAMES.find(([p]) => p === path)?.[1] ?? null;
}

export type SavedPage = { key: string; name: string; savedAt: number | null };

/** The saved copies worth listing (named pages only, the login page and strays left out), in the app's own order. */
export function listSavedPages(copies: readonly { key: string; savedAt: number | null }[]): SavedPage[] {
  const order = (key: string) => {
    const path = key.split("?")[0];
    const at = NAMES.findIndex(([p]) => p === path);
    return at < 0 ? NAMES.length : at;
  };
  const seen = new Set<string>();
  const out: SavedPage[] = [];
  for (const c of copies) {
    const name = savedPageName(c.key);
    if (!name || seen.has(c.key)) continue;
    seen.add(c.key);
    out.push({ key: c.key, name, savedAt: c.savedAt });
  }
  return out.sort((a, b) => order(a.key) - order(b.key) || a.key.localeCompare(b.key));
}

/** The oldest and newest save among the pages: "Saved 2 hours ago" is true of the page that is the stalest. */
export function oldestSave(pages: readonly SavedPage[]): number | null {
  const times = pages.map((p) => p.savedAt).filter((t): t is number => typeof t === "number" && t > 0);
  return times.length ? Math.min(...times) : null;
}

/** Where the phone's storage stands, as the sentence the card shows (and whether to offer to protect it). */
export function storageLine(persisted: boolean | null): { text: string; canAsk: boolean } {
  if (persisted === true) return { text: "This phone has promised to keep what the app stores here.", canAsk: false };
  if (persisted === false) return { text: "This phone may clear what the app stores here when it runs short of space, including entries not yet sent.", canAsk: true };
  return { text: "This phone doesn't say whether it will keep what the app stores here.", canAsk: false };
}
