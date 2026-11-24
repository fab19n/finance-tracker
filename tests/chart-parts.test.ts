import { describe, expect, it } from "vitest";
import { pillLeft, pillWidth } from "@/components/charts/parts";

describe("ValuePill placement", () => {
  const w = pillWidth("RM 3,120");
  it("right-aligns on x when there is room", () => {
    expect(pillLeft(300, w, "end")).toBe(300 - w);
  });
  it("never starts left of the plot, however near the left the last point is", () => {
    expect(pillLeft(16, w, "end")).toBe(4);
    expect(pillLeft(0, w, "end")).toBe(4);
    expect(pillLeft(10, w, "middle")).toBe(4);
  });
  it("centres when asked", () => {
    expect(pillLeft(200, w, "middle")).toBe(200 - w / 2);
  });
});
