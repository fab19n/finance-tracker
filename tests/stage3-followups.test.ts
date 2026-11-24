import { describe, expect, it } from "vitest";
import { clearAllDrafts, DRAFT_LAST_KEY, DRAFT_MAX_AGE_MS, DRAFT_PREFIX, parseDraft } from "@/lib/import/draft";
import { SETUP_SKIP_MS, skipStillActive } from "@/lib/setup";

const draft = (savedAt: string) =>
  JSON.stringify({ v: 1, fp: "abc", savedAt, fileName: null, accountId: 1, startDate: "", setOpening: false, filter: "all", preview: {}, rows: [{ key: "k", amount: 1, index: 0, kind: "expense" }] });

describe("an import review does not live for ever", () => {
  const now = Date.parse("2026-11-24T00:00:00Z");
  it("is resumed when recent and forgotten after two weeks", () => {
    expect(parseDraft(draft("2026-11-20T00:00:00Z"), "abc", now)).not.toBeNull();
    expect(parseDraft(draft(new Date(now - DRAFT_MAX_AGE_MS - 1000).toISOString()), "abc", now)).toBeNull();
  });
  it("is not trusted without a readable save time", () => {
    expect(parseDraft(draft("not a date"), "abc", now)).toBeNull();
  });
  it("Lock now clears every saved review and nothing else", () => {
    const data = new Map<string, string>([
      [DRAFT_PREFIX + "abc", "x"],
      [DRAFT_PREFIX + "def", "y"],
      [DRAFT_LAST_KEY, "z"],
      ["money-tracker:setup-skipped", "1"],
    ]);
    const store = {
      get length() {
        return data.size;
      },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    clearAllDrafts(store);
    expect([...data.keys()]).toEqual(["money-tracker:setup-skipped"]);
  });
});

describe("setup checklist skip", () => {
  const now = 1_800_000_000_000;
  it("hides the card for a week, then it comes back", () => {
    expect(skipStillActive(String(now - 1000), now)).toBe(true);
    expect(skipStillActive(String(now - SETUP_SKIP_MS - 1), now)).toBe(false);
  });
  it("ignores the old flag, junk and a time in the future", () => {
    for (const bad of ["1", "", "abc", null, undefined, String(now + 5000)]) expect(skipStillActive(bad, now)).toBe(false);
  });
});
