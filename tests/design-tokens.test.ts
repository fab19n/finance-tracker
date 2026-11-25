import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "src", "app", "globals.css"), "utf8");

/** The text between the braces that follow `marker`, with nested braces matched. */
function block(marker: string): string {
  const at = css.indexOf(marker);
  if (at < 0) throw new Error(`globals.css has no "${marker}"`);
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed block after "${marker}"`);
}

/** `--name: value;` declarations of a block, comments removed, in order. */
function tokens(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

const light = tokens(block(":root {"));
const dark = tokens(block(':root[data-theme="dark"]'));
const darkMedia = tokens(block(':root:not([data-theme="light"])'));

/** A token's colour, following var(--other) references. */
function colour(theme: Map<string, string>, name: string): string {
  let v = theme.get(name);
  for (let i = 0; v?.startsWith("var(") && i < 5; i++) v = theme.get(v.slice(4, -1).trim());
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`--${name.replace(/^--/, "")} is not a plain hex colour: ${v}`);
  return v;
}

const channel = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every text-on-background pair the design uses. Text of 11-14 px is not "large", so each needs 4.5:1.
const TEXT_PAIRS: [text: string, on: string[]][] = [
  ["--foreground", ["--background", "--card", "--card-subtle", "--nav-active-bg"]],
  ["--muted", ["--background", "--card", "--card-subtle"]],
  ["--ink-muted", ["--background", "--card", "--card-subtle"]], // chart axis text
  ["--accent-fg", ["--accent"]], // buttons and the hero card
  ["--accent-strong", ["--background", "--card", "--card-subtle", "--accent-soft", "--nav-active-bg"]], // links and accent text
  ["--good", ["--background", "--card", "--good-soft"]],
  ["--warn", ["--card", "--warn-soft"]],
  ["--danger", ["--background", "--card", "--danger-soft"]],
  ["--info", ["--info-soft"]],
  ["--danger-fg", ["--danger"]], // text on a solid danger fill
  ["--nav-fg", ["--nav-bg"]], // an idle tab on the tab bar
  ["--nav-strong", ["--nav-bg"]], // the chosen tab's label
  ["--hero-fg", ["--hero-bg"]], // text on the hero card
  ["--hero-danger-fg", ["--hero-danger-bg"]],
  ["--day-1-fg", ["--day-1"]], // the day number on each step of the daily spending squares
  ["--day-2-fg", ["--day-2"]],
  ["--day-3-fg", ["--day-3"]],
  ["--day-4-fg", ["--day-4"]],
];

describe("design tokens", () => {
  it("writes the dark theme twice, identically (the OS-driven block and the forced block)", () => {
    expect([...darkMedia.entries()]).toEqual([...dark.entries()]);
  });

  it("defines every token in Light and in Dark", () => {
    expect([...dark.keys()].sort()).toEqual([...light.keys()].sort());
  });

  for (const [themeName, theme] of [
    ["Light", light],
    ["Dark", dark],
  ] as const) {
    it(`${themeName}: every text and background pair holds 4.5:1`, () => {
      const failures: string[] = [];
      for (const [text, backgrounds] of TEXT_PAIRS) {
        for (const bg of backgrounds) {
          const ratio = contrast(colour(theme, text), colour(theme, bg));
          if (ratio < 4.5) failures.push(`${text} on ${bg}: ${ratio.toFixed(2)}:1`);
        }
      }
      expect(failures).toEqual([]);
    });
  }

  // Lines, bars and the focus ring are not text, so they need 3:1 (WCAG non-text contrast). Bright gold on paper is only
  // about 1.8:1, which is why Light draws them in --accent-strong and keeps --accent for fills that carry their own label.
  for (const [themeName, theme] of [
    ["Light", light],
    ["Dark", dark],
  ] as const) {
    it(`${themeName}: the focus ring and the gold chart series hold 3:1 against the page and cards`, () => {
      const failures: string[] = [];
      // The tab bar is deep green in both themes; its focus ring is checked against it below.
      for (const token of ["--focus-ring", "--series-2", "--series-3", "--series-gray"]) {
        for (const bg of ["--background", "--card"]) {
          const ratio = contrast(colour(theme, token), colour(theme, bg));
          if (ratio < 3) failures.push(`${token} on ${bg}: ${ratio.toFixed(2)}:1`);
        }
      }
      expect(failures).toEqual([]);
    });
  }

  for (const [themeName, theme] of [
    ["Light", light],
    ["Dark", dark],
  ] as const) {
    it(`${themeName}: the tab bar's focus ring holds 3:1 on the deep-green bar`, () => {
      expect(contrast(colour(theme, "--nav-focus"), colour(theme, "--nav-bg"))).toBeGreaterThanOrEqual(3);
    });
  }

  // The daily spending squares must read as a scale: each step further from the card than the one before, and told apart.
  for (const [themeName, theme] of [
    ["Light", light],
    ["Dark", dark],
  ] as const) {
    it(`${themeName}: the daily spending shades deepen in four distinct steps`, () => {
      const card = colour(theme, "--card");
      const steps = [1, 2, 3, 4].map((n) => colour(theme, `--day-${n}`));
      for (let i = 1; i < steps.length; i++) {
        expect(contrast(steps[i], card), `--day-${i + 1} against the card`).toBeGreaterThan(contrast(steps[i - 1], card));
        expect(contrast(steps[i], steps[i - 1]), `--day-${i} to --day-${i + 1}`).toBeGreaterThanOrEqual(1.3);
      }
    });
  }

  // The status tags and banners tint a tone over the card with color-mix (a 16% tint for a tag, 14% for a banner). Mix it the
  // same way (sRGB, tone weight p) and hold the text on it: a tag's text is the tone itself (4.5:1), a banner's text is the
  // ink (4.5:1) and its icon the tone (3:1, non-text).
  const mix = (tone: string, over: string, p: number) =>
    "#" +
    [1, 3, 5]
      .map((i) => Math.round(parseInt(tone.slice(i, i + 2), 16) * p + parseInt(over.slice(i, i + 2), 16) * (1 - p)))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
  for (const [themeName, theme] of [
    ["Light", light],
    ["Dark", dark],
  ] as const) {
    it(`${themeName}: tags and banners (a tone tinted over the card) stay readable`, () => {
      const failures: string[] = [];
      const card = colour(theme, "--card");
      for (const tone of ["--good", "--warn", "--danger", "--info"]) {
        const t = colour(theme, tone);
        const tag = contrast(t, mix(t, card, 0.16));
        if (tag < 4.5) failures.push(`${tone} tag text: ${tag.toFixed(2)}:1`);
        const ink = contrast(colour(theme, "--foreground"), mix(t, card, 0.14));
        if (ink < 4.5) failures.push(`ink on ${tone} banner: ${ink.toFixed(2)}:1`);
        const icon = contrast(t, mix(t, card, 0.14));
        if (icon < 3) failures.push(`${tone} banner icon: ${icon.toFixed(2)}:1`);
      }
      expect(failures).toEqual([]);
    });
  }

  it("keeps the logo's orange the same in both themes", () => {
    expect(light.get("--brand")).toBe("#ff8f39");
    expect(dark.get("--brand")).toBe("#ff8f39");
  });
});
