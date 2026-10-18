/** The tabs of the Settings page. Each is addressable as /settings?tab=<id>; "accounts" is the default (no ?tab). */
export const SETTINGS_TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "categories", label: "Categories" },
  { id: "payday", label: "Payday" },
  { id: "investing", label: "Investing" },
  { id: "data", label: "Appearance & data" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export const DEFAULT_SETTINGS_TAB: SettingsTab = "accounts";

/** Which tab a ?tab= value names; anything else is the default. */
export function parseSettingsTab(value: string | string[] | undefined): SettingsTab {
  const v = Array.isArray(value) ? value[0] : value;
  return SETTINGS_TABS.find((t) => t.id === v)?.id ?? DEFAULT_SETTINGS_TAB;
}

/** The address of a tab, e.g. for a link, or for an action to redirect back to (with an optional error to show there). */
export function settingsHref(tab: SettingsTab, error?: string): string {
  const parts: string[] = [];
  if (tab !== DEFAULT_SETTINGS_TAB) parts.push(`tab=${tab}`);
  if (error) parts.push(`error=${encodeURIComponent(error)}`);
  return parts.length ? `/settings?${parts.join("&")}` : "/settings";
}
