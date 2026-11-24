import { describe, expect, it } from "vitest";
import { deleteSheet, deleteWarnings, entryName } from "@/lib/entry-delete";

const norm = (s: string) => s.replace(/\s/g, " ");
const base = { type: "expense" as const, amount: 350, date: "2026-10-09", item: "teh tarik", categoryName: "Eating Out" };

describe("entryName", () => {
  it("names the item and the amount", () => {
    expect(norm(entryName(base))).toBe("teh tarik, RM 3.50");
  });
  it("falls back to the category, then to a plain word", () => {
    expect(norm(entryName({ ...base, item: null }))).toBe("Eating Out, RM 3.50");
    expect(norm(entryName({ ...base, item: " ", categoryName: null }))).toBe("Entry, RM 3.50");
  });
  it("says which accounts a transfer joined", () => {
    expect(norm(entryName({ ...base, type: "transfer", item: null, categoryName: null, accountName: "Bank", toAccountName: "Wallet" }))).toBe("Transfer Bank to Wallet, RM 3.50");
  });
});

describe("deleteWarnings", () => {
  it("is empty for a plain entry", () => {
    expect(deleteWarnings({})).toEqual([]);
    expect(deleteWarnings({ billId: null, shareId: null, imported: 0 })).toEqual([]);
  });
  it("names each thing the entry is tied to", () => {
    expect(deleteWarnings({ billId: 3 })).toHaveLength(1);
    expect(deleteWarnings({ billId: 3 })[0]).toMatch(/bills/);
    expect(deleteWarnings({ shareId: 2 })[0]).toMatch(/owe it again/);
    expect(deleteWarnings({ imported: 1 })[0]).toMatch(/bank statement/);
    expect(deleteWarnings({ billId: 3, shareId: 2, imported: 1 })).toHaveLength(3);
  });
});

describe("deleteSheet", () => {
  it("puts the entry, its date and the warnings together", () => {
    const s = deleteSheet({ ...base, imported: 1 });
    expect(norm(s.title)).toBe("Delete teh tarik, RM 3.50?");
    expect(s.body).toContain("9 Oct");
    expect(s.warnings).toHaveLength(1);
  });
});
