import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/open";
import { accounts } from "@/db/schema";

// The More menu's live figures, against a real in-memory database (only the connection is stubbed).
const h = vi.hoisted(() => ({ db: null as unknown as DB, fail: null as unknown }));
vi.mock("@/db/client", () => ({
  getDb: async () => {
    if (h.fail) throw h.fail;
    return h.db;
  },
}));

import { getMoreSummary } from "@/lib/queries/more-summary";

beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  h.fail = null;
});

describe("getMoreSummary", () => {
  it("has no figure for what is not set up, so those rows show none", async () => {
    const s = await getMoreSummary("2026-11-24");
    expect(s.leftToSpend).toBeNull(); // no spending account chosen
    expect(s.owedToYou).toBeNull(); // nothing shared
    expect(s.portfolio).toBeNull(); // nothing invested
    expect(typeof s.findings).toBe("number");
  });

  it("gives what is left to spend once a spending account exists", async () => {
    const bank = h.db.select().from(accounts).all().find((a) => a.type === "bank")!;
    h.db.update(accounts).set({ purpose: "spending", openingBalance: 123400 }).where(eq(accounts.id, bank.id)).run();
    const s = await getMoreSummary("2026-11-24");
    expect(s.leftToSpend).toBe(123400);
  });

  it("lets a redirect through instead of swallowing it as 'no figure'", async () => {
    h.fail = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    await expect(getMoreSummary("2026-11-24")).rejects.toThrow("NEXT_REDIRECT");
  });

  it("drops only the figure that failed", async () => {
    h.fail = new Error("disk went away");
    const s = await getMoreSummary("2026-11-24");
    expect(s).toEqual({ leftToSpend: null, owedToYou: null, findings: null, portfolio: null });
  });
});
