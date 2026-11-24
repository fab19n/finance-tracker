import { describe, expect, it } from "vitest";
import { isUnreachable } from "@/lib/offline/unreachable";
import { deleteBillBody, goesWithBill, NO_USAGE } from "@/lib/plan/bill-delete";

describe("isUnreachable", () => {
  it("is true for a failed fetch and for the proxy's unreadable reply", () => {
    expect(isUnreachable(new TypeError("Failed to fetch"))).toBe(true);
    expect(isUnreachable(new TypeError("Load failed"))).toBe(true);
    expect(isUnreachable(new Error("An unexpected response was received from the server."))).toBe(true);
    expect(isUnreachable(new Error("NetworkError when attempting to fetch resource."))).toBe(true);
  });
  it("is false for the app's own errors", () => {
    expect(isUnreachable(new Error("Unique constraint failed"))).toBe(false);
    expect(isUnreachable(new Error("NEXT_REDIRECT"))).toBe(false);
    expect(isUnreachable(null)).toBe(false);
    expect(isUnreachable(undefined)).toBe(false);
  });
});

describe("deleteBillBody", () => {
  it("names the people, turns and rules that go, and says payments stay", () => {
    const body = deleteBillBody({ payments: 14, people: 3, turns: 12, rules: 2 });
    expect(body).toContain("3 people sharing it, with what each owes");
    expect(body).toContain("12 planned turns in the rotation");
    expect(body).toContain("2 learned import rules");
    expect(body).toContain("14 payments you recorded for it stay as entries");
    expect(body).toContain("no longer counted towards anyone");
    expect(body).toMatch(/can't be undone/);
    expect(body).toMatch(/untick Active/);
  });
  it("uses singular forms and says plainly when nothing else is attached", () => {
    expect(goesWithBill({ ...NO_USAGE, people: 1, turns: 1, rules: 1 })).toEqual(["1 person sharing it, with what they owe", "1 planned turn in the rotation", "1 learned import rule"]);
    const body = deleteBillBody(NO_USAGE);
    expect(body).toMatch(/Nothing else is attached/);
    expect(body).not.toMatch(/also deletes/);
  });
});
