// Pure helpers for the browser checks (no browser, no network, no clock). Unit-tested in tests/e2e-helpers.test.ts.

export const DEFAULT_PAGES = [
  "/",
  "/dashboard",
  "/transactions",
  "/accounts",
  "/accounts/1",
  "/plan",
  "/plan/bills",
  "/plan/shared",
  "/insights",
  "/invest",
  "/settings",
  "/settings?tab=categories",
  "/settings?tab=payday",
  "/settings?tab=investing",
  "/settings?tab=data",
  "/import",
  "/more",
];

export const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, mobile: true },
  { name: "desktop", width: 1280, height: 900, mobile: false },
];

export const THEMES = ["light", "dark"];

export const MIN_TARGET_PX = 40;
export const MIN_CONTRAST = 4.5;
export const MIN_CONTRAST_LARGE = 3;

/** Parse the command line. `--warn-only` is a flag; every other option takes a value. Unknown options throw. */
export function parseArgs(argv) {
  const out = { base: null, browser: null, pages: null, warnOnly: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--warn-only") out.warnOnly = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--base" || a === "--browser" || a === "--pages") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      if (a === "--base") out.base = v;
      else if (a === "--browser") out.browser = v;
      else out.pages = v;
    } else if (a.startsWith("--base=")) out.base = a.slice(7);
    else if (a.startsWith("--browser=")) out.browser = a.slice(10);
    else if (a.startsWith("--pages=")) out.pages = a.slice(8);
    else throw new Error(`Unknown option ${a}`);
  }
  return out;
}

/** "http://127.0.0.1:3210/" -> "http://127.0.0.1:3210". Throws on anything that is not http(s). */
export function normaliseBase(base) {
  if (!base) throw new Error("--base is required, for example --base http://127.0.0.1:3210");
  let u;
  try {
    u = new URL(base);
  } catch {
    throw new Error(`--base is not a URL: ${base}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`--base must be http or https: ${base}`);
  return u.origin;
}

/** "a,b" -> ["/a","/b"]; entries keep a leading slash; blanks are dropped; null means the default list. */
export function parsePages(csv) {
  if (csv == null) return DEFAULT_PAGES.slice();
  const pages = csv
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith("/") ? p : `/${p}`));
  if (!pages.length) throw new Error("--pages is empty");
  return pages;
}

/** The first existing path among `candidates` (a function says what exists), or null. */
export function pickBrowser(candidates, exists) {
  for (const c of candidates) if (c && exists(c)) return c;
  return null;
}

/** Where Edge or Chrome usually lives on Windows (and a few other places), most specific first. */
export function browserCandidates(env, platform = "win32") {
  if (platform === "win32") {
    const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(Boolean);
    const rel = ["Microsoft\\Edge\\Application\\msedge.exe", "Google\\Chrome\\Application\\chrome.exe"];
    const out = [];
    for (const r of rel) for (const root of roots) out.push(`${root}\\${r}`);
    return out;
  }
  if (platform === "darwin") {
    return [
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ];
  }
  return [];
}

/** Names to look up on PATH when no installed browser was found. */
export const PATH_BROWSER_NAMES = ["msedge", "microsoft-edge", "google-chrome", "chrome", "chromium", "chromium-browser"];

// ---------------------------------------------------------------- colour

/** Parse `rgb(…)`, `rgba(…)` (comma or space syntax) and `#rgb`/`#rrggbb`. Returns {r,g,b,a} (0-255, a 0-1) or null. */
export function parseColor(input) {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) {
    return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  }
  m = /^rgba?\(\s*([^)]+)\)$/.exec(s);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const chan = (p) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p));
  const r = chan(parts[0]);
  const g = chan(parts[1]);
  const b = chan(parts[2]);
  let a = 1;
  if (parts[3] !== undefined) a = parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
  const clamp = (n, hi) => Math.min(hi, Math.max(0, n));
  return { r: clamp(r, 255), g: clamp(g, 255), b: clamp(b, 255), a: clamp(a, 1) };
}

/** `top` painted over an opaque `bottom`. */
export function blend(top, bottom) {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

/** Stack of background layers (nearest element first, as strings) over `base` (default white). Returns an opaque colour. */
export function flattenBackground(layers, base = { r: 255, g: 255, b: 255, a: 1 }) {
  let bg = base;
  // Paint from the farthest ancestor to the nearest element.
  for (let i = layers.length - 1; i >= 0; i--) {
    const c = parseColor(layers[i]);
    if (!c || c.a === 0) continue;
    bg = c.a >= 1 ? { ...c, a: 1 } : blend(c, bg);
  }
  return bg;
}

/** WCAG relative luminance of an opaque colour. */
export function luminance({ r, g, b }) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio of two opaque colours (1 to 21). */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Large text (WCAG): 24 px and up, or 18.66 px and up when bold. */
export function isLargeText(fontSizePx, fontWeight) {
  const w = Number(fontWeight) || 400;
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && w >= 700);
}

/**
 * One sample from the page: {color, layers, fontSize, fontWeight}. Returns {ratio, required, ok} or null when the colour
 * cannot be read. The text colour is blended over the flattened background when it is translucent.
 */
export function evaluateContrast(sample) {
  const fg = parseColor(sample.color);
  if (!fg) return null;
  const bg = flattenBackground(sample.layers || []);
  const text = fg.a < 1 ? blend(fg, bg) : fg;
  const ratio = contrastRatio(text, bg);
  const required = isLargeText(sample.fontSize, sample.fontWeight) ? MIN_CONTRAST_LARGE : MIN_CONTRAST;
  return { ratio, required, ok: ratio + 1e-9 >= required };
}

// ---------------------------------------------------------------- names

const collapse = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/**
 * The accessible name of a control from what the page reports: {ariaLabel, labelledBy: [texts of referenced elements],
 * labels: [texts of <label>s], text, title, alt, placeholder, value, tag, type}. Order follows the accessible-name
 * computation closely enough for these checks: aria-labelledby, aria-label, native label / alt / value, content, title.
 */
export function accessibleName(d) {
  const labelledBy = collapse((d.labelledBy || []).map(collapse).filter(Boolean).join(" "));
  if (labelledBy) return labelledBy;
  const aria = collapse(d.ariaLabel);
  if (aria) return aria;
  const labels = collapse((d.labels || []).map(collapse).filter(Boolean).join(" "));
  if (labels) return labels;
  if (collapse(d.alt)) return collapse(d.alt);
  if (d.tag === "input" && (d.type === "submit" || d.type === "button" || d.type === "reset") && collapse(d.value)) return collapse(d.value);
  const text = collapse(d.text);
  if (text) return text;
  if (collapse(d.title)) return collapse(d.title);
  if (collapse(d.placeholder)) return collapse(d.placeholder);
  return "";
}

/** The ids that appear more than once (empty ids are ignored), each once, in first-seen order. */
export function duplicateIds(ids) {
  const seen = new Map();
  for (const id of ids) {
    if (!id) continue;
    seen.set(id, (seen.get(id) || 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
}

/** A title that says nothing: empty, or only the app name. */
export function isGenericTitle(title, appName = "Koopang") {
  const t = collapse(title).toLowerCase();
  return t === "" || t === appName.toLowerCase();
}

// ---------------------------------------------------------------- reporting

/** Short one-line text for a table cell. */
export function truncate(s, n = 60) {
  const t = collapse(String(s ?? ""));
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Plain-text table with padded columns. `rows` are arrays of strings. */
export function formatTable(headers, rows) {
  const all = [headers, ...rows].map((r) => r.map((c) => String(c ?? "")));
  const widths = headers.map((_, i) => Math.max(...all.map((r) => (r[i] || "").length)));
  const line = (r) => r.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  return [line(all[0]), widths.map((w) => "-".repeat(w)).join("  "), ...all.slice(1).map(line)].join("\n");
}

/**
 * Failures are {page, viewport, theme, check, detail}. Groups them per page into one table each, merging identical
 * rows seen in several viewport/theme combinations (the "where" column lists them).
 */
export function summariseFailures(failures) {
  const byPage = new Map();
  for (const f of failures) {
    if (!byPage.has(f.page)) byPage.set(f.page, new Map());
    const key = `${f.check}\u0000${f.detail}`;
    const m = byPage.get(f.page);
    if (!m.has(key)) m.set(key, { check: f.check, detail: f.detail, where: [] });
    const w = [f.viewport, f.theme].filter(Boolean).join("/");
    const entry = m.get(key);
    if (w && !entry.where.includes(w)) entry.where.push(w);
  }
  return [...byPage].map(([page, m]) => ({
    page,
    rows: [...m.values()].map((e) => [e.check, truncate(e.detail, 110), e.where.join(" ")]),
  }));
}

export function renderReport(failures, checkedCount) {
  if (!failures.length) return `All ${checkedCount} checks passed.`;
  const parts = [];
  for (const { page, rows } of summariseFailures(failures)) {
    parts.push(`${page}  (${rows.length} problem${rows.length === 1 ? "" : "s"})`);
    parts.push(formatTable(["check", "detail", "where"], rows));
    parts.push("");
  }
  parts.push(`${failures.length} failure${failures.length === 1 ? "" : "s"} in ${checkedCount} checks.`);
  return parts.join("\n");
}

/** Exit code: 0 when there are no failures or `warnOnly`, else 1. */
export function exitCode(failures, warnOnly) {
  return failures.length && !warnOnly ? 1 : 0;
}

/** Turn a list of per-element findings into failure rows for one check name. */
export function toFailures(ctx, check, details) {
  return details.map((detail) => ({ ...ctx, check, detail }));
}

/** Console messages worth failing on: errors only, minus the browser's own noise for missing favicons. */
export function isRealConsoleError(entry) {
  if (!entry || entry.level !== "error") return false;
  const t = `${entry.text || ""} ${entry.url || ""}`;
  if (/favicon\.ico/i.test(t)) return false;
  return true;
}

/** Is the redirect target the login page? */
export function redirectsToLogin(status, location, base) {
  if (!(status >= 300 && status < 400) || !location) return false;
  try {
    return new URL(location, base).pathname === "/login";
  } catch {
    return false;
  }
}

/** Does the focus indicator differ from the unfocused look? Both are {outline, boxShadow, borderColor, bg}. */
/** Does this computed style draw an outline? (A page link carries a permanent one for "you are here": that is a ring too.) */
export function hasOutline(s) {
  return !!s && s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 && (parseColor(s.outlineColor)?.a ?? 1) > 0;
}

export function focusRingVisible(before, after) {
  const outlineOn = (s) => s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 && (parseColor(s.outlineColor)?.a ?? 1) > 0;
  if (outlineOn(after) && !(outlineOn(before) && before.outlineColor === after.outlineColor && before.outlineWidth === after.outlineWidth)) return true;
  const shadow = (s) => (s.boxShadow && s.boxShadow !== "none" ? s.boxShadow : "");
  if (shadow(after) && shadow(after) !== shadow(before)) return true;
  if (after.borderColor !== before.borderColor && after.borderColor) return true;
  if (after.backgroundColor !== before.backgroundColor && after.backgroundColor) return true;
  return false;
}
