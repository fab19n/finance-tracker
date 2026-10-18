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
  ["--danger-fg", ["--danger"]], // the hero card when safe-to-spend is negative
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

  it("keeps the logo's orange the same in both themes", () => {
    expect(light.get("--brand")).toBe("#ff8f39");
    expect(dark.get("--brand")).toBe("#ff8f39");
  });
});
