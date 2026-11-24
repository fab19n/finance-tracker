import { describe, expect, it } from "vitest";
import { dashboardLinks } from "@/lib/analytics/insight-links";
import { dashboardMonthHref, detectLeaks, headlineSavings, slugId, type Insight } from "@/lib/analytics/leakage";
import { formatRMWholeBare } from "@/lib/money";
import { missingSetupSteps, setupFacts, setupProgress } from "@/lib/setup";
import { needWantSplit } from "@/lib/analytics/summary";
import { row } from "./helpers";

const none = { accountCount: 0, hasSpendingAccount: false, hasSavingsAccount: false, paydayKnown: false, hasEntries: false };

describe("setup checklist", () => {
  it("lists every step in order on a fresh database", () => {
    expect(missingSetupSteps(none).map((s) => s.id)).toEqual(["accounts", "spending", "savings", "payday", "entry"]);
  });
  it("is empty when everything is done", () => {
    expect(missingSetupSteps({ accountCount: 2, hasSpendingAccount: true, hasSavingsAccount: true, paydayKnown: true, hasEntries: true })).toEqual([]);
  });
  it("links each step to its Settings tab", () => {
    const hrefs = Object.fromEntries(missingSetupSteps(none).map((s) => [s.id, s.href]));
    expect(hrefs.payday).toBe("/settings?tab=payday");
    expect(hrefs.spending).toBe("/settings");
  });
  it("progress marks done steps", () => {
    const p = setupProgress({ ...none, accountCount: 1, hasEntries: true });
    expect(p.map((x) => x.done)).toEqual([true, false, false, false, true]);
  });
  it("builds facts, ignoring archived accounts, and counts an expected income as a known payday", () => {
    const f = setupFacts({
      accounts: [
        { archived: true, purpose: "spending" },
        { archived: false, purpose: "savings" },
      ],
      hasSalary: false,
      expectedIncome: 500000,
      hasEntries: false,
    });
    expect(f).toEqual({ accountCount: 1, hasSpendingAccount: false, hasSavingsAccount: true, paydayKnown: true, hasEntries: false });
  });
});

describe("formatRMWholeBare", () => {
  it("strips the currency prefix including the no-break space", () => {
    expect(formatRMWholeBare(32000)).toBe("320");
    expect(formatRMWholeBare(123456700)).toBe("1,234,567");
  });
});

describe("insight helpers", () => {
  const ins = (id: string, annual: number): Insight => ({
    id,
    kind: "spike",
    severity: "low",
    title: id,
    evidence: [],
    suggestion: "",
    monthlySaving: annual / 12,
    annualSaving: annual,
    investedValue: annual,
  });
  it("headline counts only findings that carry a saving", () => {
    const h = headlineSavings([ins("a", 0), ins("b", 1200), ins("c", 2400), ins("d", 0)]);
    expect(h.count).toBe(2);
    expect(h.annual).toBe(3600);
    expect(headlineSavings([ins("a", 0)]).monthly).toBe(0);
  });
  it("slugs user text into a safe id", () => {
    expect(slugId("h", 'oneoff-Eating "Out" & <b>')).toBe("h-oneoff-eating-out-b");
    expect(slugId("h", "???")).toBe("h-x");
  });
  it("Home links name the month and view", () => {
    expect(dashboardMonthHref("2026-10")).toBe("/dashboard?view=month&month=2026-10");
    expect(dashboardLinks("2026-10-09")).toEqual({ month: "/dashboard?view=month&month=2026-10", cycle: "/dashboard?view=cycle" });
  });
  it("the wants-heavy finding opens Home in month view", () => {
    const rows = [
      row({ date: "2026-09-02", rm: 5000, type: "income", cat: "Salary", nature: "need" }),
      row({ date: "2026-09-05", rm: 3000, cat: "Fun", nature: "want", item: "Games" }),
    ];
    const found = detectLeaks({
      rows,
      today: "2026-10-09",
      categories: [],
      assumptions: { sp500ReturnPct: 7, horizonYears: 10 },
      cash: { unaccounted90: 0, withdrawn90: 0 },
    });
    const w = found.find((i) => i.kind === "wants_heavy");
    expect(w?.href).toBe("/dashboard?view=month&month=2026-09");
  });
});

describe("50/30/20 income test", () => {
  const rows = [
    row({ date: "2026-10-02", rm: 0.11, type: "income", cat: "Interest", nature: "need" }),
    row({ date: "2026-10-03", rm: 100, cat: "Food", nature: "need" }),
  ];
  it("treats a few sen as no income when the page says there is no pay", () => {
    expect(needWantSplit(rows, "2026-10").vsIncome).toBe(true);
    expect(needWantSplit(rows, "2026-10", false).vsIncome).toBe(false);
  });
});
