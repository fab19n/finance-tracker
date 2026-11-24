import { describe, expect, it } from "vitest";
import { clearDraft, DRAFT_LAST_KEY, DRAFT_PREFIX, fingerprint, lastDraft, loadDraft, parseDraft, saveDraft, type Draft, type DraftStore } from "@/lib/import/draft";
import { confirmEdited, needsLook, rowIncomplete, skippedDrift, watchAfterEdit, type ReviewRow } from "@/lib/import/review";

const row = (o: Partial<ReviewRow & { edited: boolean }> = {}): ReviewRow & { edited: boolean } => ({
  index: 0, kind: "expense", categoryId: 3, transferAccountId: null, proposal: { confidence: "low" }, confirmed: false, watch: false, edited: false, ...o,
});
const none = new Set<number>();

describe("needs a look", () => {
  it("keeps a low-confidence line flagged after it is edited, until confirmed", () => {
    const edited = row({ edited: true });
    expect(needsLook(edited, none)).toBe(true);
    expect(needsLook({ ...edited, confirmed: true }, none)).toBe(false);
  });
  it("keeps a line that was incomplete visible after it is completed, until confirmed", () => {
    const before = row({ proposal: { confidence: "high" }, categoryId: null });
    expect(needsLook(before, none)).toBe(true);
    const after = { ...before, categoryId: 9, edited: true };
    const watched = { ...after, watch: watchAfterEdit(before, after, none) };
    expect(needsLook(watched, none)).toBe(true);
    expect(needsLook({ ...watched, confirmed: true }, none)).toBe(false);
  });
  it("never flags a good line you merely edited, and never a skipped one", () => {
    const good = row({ proposal: { confidence: "high" } });
    const after = { ...good, item: "x", edited: true };
    expect(watchAfterEdit(good, after, none)).toBe(false);
    expect(needsLook(after, none)).toBe(false);
    expect(needsLook(row({ kind: "skip", categoryId: null }), none)).toBe(false);
  });
  it("a balance mismatch and a missing category stay until fixed, confirmed or not", () => {
    expect(needsLook(row({ index: 4, confirmed: true, proposal: { confidence: "high" } }), new Set([4]))).toBe(true);
    expect(needsLook(row({ confirmed: true, categoryId: null }), none)).toBe(true);
    expect(rowIncomplete(row({ kind: "transfer", categoryId: null }))).toBe(true);
  });
  it("a guessed direction is flagged until confirmed", () => {
    const g = row({ signedBy: "guess", proposal: { confidence: "high" } });
    expect(needsLook(g, none)).toBe(true);
    expect(needsLook({ ...g, confirmed: true }, none)).toBe(false);
  });
  it("leaving the tab confirms edited, complete lines only", () => {
    const rows = [row({ edited: true }), row({ edited: true, categoryId: null }), row()];
    expect(confirmEdited(rows).map((r) => r.confirmed)).toEqual([true, false, false]);
  });
});

function memory(): DraftStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const draft = (fp: string): Draft => ({
  v: 1, fp, savedAt: "2026-11-24T10:00:00.000Z", fileName: "may.pdf", accountId: 2, startDate: "", setOpening: true, filter: "attention",
  preview: { ok: true }, rows: [{ key: "r1", amount: -100, index: 0, kind: "expense", item: "Lunch" }],
});

describe("review draft", () => {
  it("round-trips by fingerprint, is offered only for the same statement, and is cleared after a commit", async () => {
    const s = memory();
    const fp = await fingerprint(new Uint8Array([1, 2, 3]));
    expect(fp).toBe(await fingerprint(new Uint8Array([1, 2, 3])));
    expect(fp).not.toBe(await fingerprint(new Uint8Array([1, 2, 4])));
    expect(saveDraft(s, draft(fp))).toBe(true);
    expect([...s.data.keys()].every((k) => k.startsWith("money-tracker:"))).toBe(true);
    expect(loadDraft(s, fp)?.rows[0].item).toBe("Lunch");
    expect(loadDraft(s, "other")).toBeNull();
    expect(lastDraft(s)).toMatchObject({ fp, fileName: "may.pdf" });
    clearDraft(s, fp);
    expect(loadDraft(s, fp)).toBeNull();
    expect(lastDraft(s)).toBeNull();
    expect(s.data.size).toBe(0);
  });
  it("has no place for a password", () => {
    expect(Object.keys(draft("a"))).not.toContain("password");
  });
  it("ignores damaged, old or empty drafts and survives a full or blocked store", () => {
    expect(parseDraft("{not json", "a")).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft("a"), v: 0 }), "a")).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft("a"), rows: [] }), "a")).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft("a"), rows: [{ key: 1 }] }), "a")).toBeNull();
    expect(parseDraft(null, "a")).toBeNull();
    const full: DraftStore = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(saveDraft(full, draft("a"))).toBe(false);
    expect(loadDraft(full, "a")).toBeNull();
    expect(() => clearDraft(full, "a")).not.toThrow();
    expect(DRAFT_PREFIX).toContain("money-tracker:");
    expect(DRAFT_LAST_KEY).toContain("money-tracker:");
  });
});

describe("skippedDrift", () => {
  const row = (kind: string, amount: number, source = "default") => ({ kind, amount, proposal: { source } });
  it("is null when only duplicates, cancelled holds or nothing are left out", () => {
    expect(skippedDrift([row("expense", -500), row("skip", -900, "duplicate")])).toBeNull();
    expect(skippedDrift([row("skip", -1000, "hold"), row("skip", 1000, "hold")])).toBeNull();
  });
  it("says how far the account ends from the bank's closing balance", () => {
    // A RM 12.00 spend left out: the books end RM 12.00 above the bank.
    expect(skippedDrift([row("skip", -1200)])).toEqual({ count: 1, sen: 1200 });
    // Money in left out: the books end below it.
    expect(skippedDrift([row("skip", 5000), row("expense", -100)])).toEqual({ count: 1, sen: -5000 });
  });
});
