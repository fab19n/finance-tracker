import { describe, expect, it } from "vitest";
import { scrollLeftToShow } from "@/lib/scroll";

// A 335px-wide row of chips, 900px of content in all.
const row = { viewWidth: 335, scrollWidth: 900 };

describe("scrolling a chip into view", () => {
  it("leaves the row alone when the chip is already fully visible", () => {
    expect(scrollLeftToShow({ ...row, scrollLeft: 0, chipLeft: 20, chipWidth: 120 })).toBeNull();
    // still visible after the user has scrolled a little
    expect(scrollLeftToShow({ ...row, scrollLeft: 100, chipLeft: 120, chipWidth: 120 })).toBeNull();
  });

  it("centres a chip that sits past the right edge", () => {
    // chip at 540..660, the row shows 0..335: centre it => 600 - 167.5 = 432.5 -> 433 (within the 565 maximum)
    expect(scrollLeftToShow({ ...row, scrollLeft: 0, chipLeft: 540, chipWidth: 120 })).toBe(433);
  });

  it("scrolls back for a chip hidden off the left edge", () => {
    expect(scrollLeftToShow({ ...row, scrollLeft: 500, chipLeft: 100, chipWidth: 120 })).toBe(0); // centre would be negative: stop at 0
    expect(scrollLeftToShow({ ...row, scrollLeft: 500, chipLeft: 300, chipWidth: 120 })).toBe(193); // 300 - 107.5 = 192.5, rounded
  });

  it("never scrolls past the end of the row", () => {
    // the last chip: centring would want more than the row can scroll
    expect(scrollLeftToShow({ ...row, scrollLeft: 0, chipLeft: 780, chipWidth: 120 })).toBe(565);
  });

  it("counts a chip cut off by a pixel as hidden", () => {
    expect(scrollLeftToShow({ ...row, scrollLeft: 0, chipLeft: 216, chipWidth: 120 })).not.toBeNull(); // ends at 336, the row at 335
    expect(scrollLeftToShow({ ...row, scrollLeft: 0, chipLeft: 215, chipWidth: 120 })).toBeNull();
  });

  it("does nothing when everything fits (a desktop row has nothing to scroll)", () => {
    expect(scrollLeftToShow({ viewWidth: 900, scrollWidth: 900, scrollLeft: 0, chipLeft: 400, chipWidth: 120 })).toBeNull();
    // and a row that is not scrollable at all can only ever stay at 0
    expect(scrollLeftToShow({ viewWidth: 300, scrollWidth: 300, scrollLeft: 0, chipLeft: 400, chipWidth: 120 })).toBe(0);
  });
});
