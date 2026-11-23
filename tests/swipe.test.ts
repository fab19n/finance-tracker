import { describe, expect, it } from "vitest";
import { neighbourTab, swipeDirection } from "@/lib/swipe";

describe("swipeDirection", () => {
  it("reads a clear, quick sideways drag", () => {
    expect(swipeDirection(-120, 10, 250)).toBe(-1);
    expect(swipeDirection(120, -10, 250)).toBe(1);
  });
  it("ignores a tap, a short drag, a slow drag and scrolling", () => {
    expect(swipeDirection(-5, 0, 80)).toBe(0);
    expect(swipeDirection(-60, 0, 200)).toBe(0);
    expect(swipeDirection(-200, 0, 900)).toBe(0);
    expect(swipeDirection(-100, 90, 250)).toBe(0); // diagonal: the page is being scrolled
    expect(swipeDirection(-100, 400, 250)).toBe(0);
  });
});

describe("neighbourTab", () => {
  it("moves to the next tab on a left swipe and the previous one on a right swipe", () => {
    expect(neighbourTab(1, -1, 3)).toBe(2);
    expect(neighbourTab(1, 1, 3)).toBe(0);
  });
  it("stops at both ends instead of wrapping", () => {
    expect(neighbourTab(2, -1, 3)).toBeNull();
    expect(neighbourTab(0, 1, 3)).toBeNull();
  });
  it("does nothing for no swipe or an unknown current tab", () => {
    expect(neighbourTab(1, 0, 3)).toBeNull();
    expect(neighbourTab(-1, -1, 3)).toBeNull();
    expect(neighbourTab(5, 1, 3)).toBeNull();
  });
});
