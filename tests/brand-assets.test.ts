import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const file = (p: string) => readFileSync(join(root, p));

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
/** Width and height from a PNG's IHDR chunk. */
const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

describe("the brand icons (the orange K)", () => {
  it("has the launcher icons at the sizes their names promise", () => {
    for (const n of [180, 192, 512]) {
      const png = file(`public/pwa/icon-${n}.png`);
      expect(png.subarray(0, 8).equals(PNG_SIGNATURE), `icon-${n}.png is a PNG`).toBe(true);
      expect(pngSize(png), `icon-${n}.png`).toEqual({ w: n, h: n });
    }
  });

  it("has a favicon.ico holding the K at 16, 32 and 48 px (PNG entries), not the starter's default icon", () => {
    const ico = file("src/app/favicon.ico");
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]); // reserved, type icon, 3 images
    const sizes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const entry = 6 + i * 16;
      const size = ico[entry];
      const bytes = ico.readUInt32LE(entry + 8);
      const at = ico.readUInt32LE(entry + 12);
      const data = ico.subarray(at, at + bytes);
      expect(data.subarray(0, 8).equals(PNG_SIGNATURE), `entry ${i} is a PNG`).toBe(true);
      expect(pngSize(data)).toEqual({ w: size, h: size });
      sizes.push(size);
    }
    expect(sizes).toEqual([16, 32, 48]);
  });

  it("serves the SVG favicon from /pwa/ as an exact copy of its source in assets/brand", () => {
    const svg = file("public/pwa/icon.svg").toString("utf8");
    expect(svg).toBe(file("assets/brand/koopang-favicon.svg").toString("utf8"));
    expect(svg).toContain("#ff8f39"); // the K
    expect(svg).toContain("#2b2b2e"); // the charcoal tile
  });
});
