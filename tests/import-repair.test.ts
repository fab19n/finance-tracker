import { describe, expect, it } from "vitest";
import { applyFix, breakDetails, chainMismatches, describeBreak, describeFix, repairCandidates, type ChainRow } from "@/lib/import/repair";

const line = (index: number, amount: number, balance: number | null, o: Partial<ChainRow> = {}): ChainRow => ({
  index,
  date: "2026-05-01",
  description: `LINE ${index}`,
  amount,
  balance,
  signedBy: "balance",
  ...o,
});
const OPEN = 100000;

describe("breakDetails", () => {
  it("says what the bank printed against what the lines add to", () => {
    const rows = [line(0, -1000, 99000), line(1, -500, 98000), line(2, -200, 97800)];
    expect(chainMismatches(rows, OPEN)).toEqual([1]);
    expect(breakDetails(rows, OPEN)).toEqual([{ index: 1, previousBalance: 99000, printedBalance: 98000, amount: -500, linesAddTo: 98500, missing: -500 }]);
  });

  it("is empty for a statement that adds up, and a same-size wrong direction is not a break (the check already settles it)", () => {
    expect(chainMismatches([line(0, -1000, 99000), line(1, 300, 98700)], OPEN)).toEqual([]);
    // -300 printed but the balance fell by 300... a +300 line whose balance went DOWN is repaired by the check, not reported.
    expect(chainMismatches([line(0, 1000, 99000)], OPEN)).toEqual([]);
  });
});

describe("repairCandidates", () => {
  it("offers the bank's own figure for a misread amount, and a balancing line, and proves each one", () => {
    const rows = [line(0, -1000, 99000), line(1, -500, 98000), line(2, -200, 97800)];
    const fixes = repairCandidates(rows, OPEN, 1);
    expect(fixes.map((f) => f.kind)).toEqual(["amount", "adjust"]);
    expect(fixes[0]).toEqual({ kind: "amount", index: 1, from: -500, to: -1000 });
    expect(fixes[1]).toEqual({ kind: "adjust", index: 1, amount: -500 });
    for (const f of fixes) expect(chainMismatches(applyFix(rows, f), OPEN)).toEqual([]);
  });

  it("does not offer leaving a line out when that only moves the break to the next line", () => {
    const rows = [line(0, -1000, 99000), line(1, -500, 98000), line(2, -200, 97800)];
    expect(repairCandidates(rows, OPEN, 1).some((f) => f.kind === "skip")).toBe(false);
  });

  it("finds a misread balance that broke two neighbouring lines, and puts the correct one first", () => {
    // The balance after line 1 was read as 88,500.00 instead of 98,500.00: line 1 AND line 2 stop adding up.
    const rows = [line(0, -1000, 99000), line(1, -500, 88500), line(2, -200, 98300)];
    expect(chainMismatches(rows, OPEN)).toEqual([1, 2]);
    const fixes = repairCandidates(rows, OPEN, 1);
    expect(fixes[0]).toEqual({ kind: "balance", index: 1, from: 88500, to: 98500 });
    expect(chainMismatches(applyFix(rows, fixes[0]), OPEN)).toEqual([]);
    // Changing only the amount clears this line but leaves the next one broken, so it is not worse, and the user sees both.
    const amount = fixes.find((f) => f.kind === "amount")!;
    expect(chainMismatches(applyFix(rows, amount), OPEN)).toEqual([2]);
  });

  it("offers to leave out a phantom line (a repeated row that moved no money)", () => {
    const rows = [line(0, -1000, 99000), line(1, -1000, 99000), line(2, -200, 98800)];
    expect(chainMismatches(rows, OPEN)).toEqual([1]);
    const fixes = repairCandidates(rows, OPEN, 1);
    expect(fixes.map((f) => f.kind)).toEqual(["skip", "adjust"]);
    expect(chainMismatches(applyFix(rows, fixes[0]), OPEN)).toEqual([]);
  });

  it("never offers to leave out a line that is locked (already skipped as a duplicate)", () => {
    const rows = [line(0, -1000, 99000), line(1, -1000, 99000)];
    const fixes = repairCandidates(rows, OPEN, 1, { locked: new Set([1]) });
    expect(fixes.map((f) => f.kind)).toEqual(["adjust"]);
  });

  it("offers nothing for a line that adds up", () => {
    expect(repairCandidates([line(0, -1000, 99000)], OPEN, 0)).toEqual([]);
  });

  it("works from an inferred opening balance (null) too", () => {
    const rows = [line(0, -1000, 99000), line(1, -500, 98000)];
    expect(chainMismatches(rows, null)).toEqual([1]);
    expect(repairCandidates(rows, null, 1).map((f) => f.kind)).toContain("amount");
  });
});

describe("applying a fix", () => {
  it("a balancing line gets a negative index, sits before the break, and covers exactly what was missing", () => {
    const rows = [line(0, -1000, 99000), line(1, -500, 98000)];
    const out = applyFix(rows, { kind: "adjust", index: 1, amount: -500 });
    expect(out.map((r) => r.index)).toEqual([0, -2, 1]);
    expect(out[1]).toMatchObject({ adjustFor: 1, amount: -500, balance: null });
    expect(chainMismatches(out, OPEN)).toEqual([]);
  });

  it("a balancing line of the wrong size does not hide the break", () => {
    const rows = [line(0, -1000, 99000), line(1, -500, 98000)];
    expect(chainMismatches(applyFix(rows, { kind: "adjust", index: 1, amount: -100 }), OPEN)).toEqual([1]);
  });

  it("leaving a line out takes its balance out of the chain too", () => {
    const rows = [line(0, -1000, 99000), line(1, -1000, 99000), line(2, -200, 98800)];
    const out = applyFix(rows, { kind: "skip", index: 1, amount: -1000 });
    expect(out[1].dropped).toBe(true);
    expect(chainMismatches(out, OPEN)).toEqual([]);
  });
});

describe("the words", () => {
  const rows = [line(0, -1000, 99000), line(1, -500, 98000)];
  const d = breakDetails(rows, OPEN)[0];
  it("explains a break in plain words with both balances and the gap", () => {
    const text = describeBreak(d, 12).replaceAll(" ", " ");
    expect(text).toContain("After line 12");
    expect(text).toContain("RM 980.00");
    expect(text).toContain("RM 985.00");
    expect(text).toContain("RM 5.00");
  });
  it("names each fix in a way a button can carry", () => {
    expect(describeFix({ kind: "amount", index: 1, from: -500, to: -1000 }, 2).label).toBe("Use the bank's figure for line 2");
    expect(describeFix({ kind: "adjust", index: 1, amount: -500 }, 2).detail).toContain("not on the statement");
    expect(describeFix({ kind: "skip", index: 1, amount: -500 }, 2).label).toBe("Leave line 2 out");
    expect(describeFix({ kind: "balance", index: 1, from: 1, to: 2 }, 2).detail).toContain("Your entries don't change");
  });
});
