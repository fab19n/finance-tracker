import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/db/open";
import { accounts, transactions } from "@/db/schema";
import { lastTypedAccountId } from "@/lib/queries/reference";

// Which account the Add form starts on: the last TYPED entry of the type, never an import, never a transfer.
const h = vi.hoisted(() => ({ db: null as unknown as DB }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));

let bank: number;
let wallet: number;
let n = 0;

beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  const add = (name: string, type: "bank" | "ewallet") => h.db.insert(accounts).values({ name, type }).returning({ id: accounts.id }).get().id;
  bank = add("Alpha Bank", "bank");
  wallet = add("Wallet", "ewallet");
});

type Row = Partial<typeof transactions.$inferInsert>;
const put = (row: Row) => h.db.insert(transactions).values({ date: "2026-10-09", type: "expense", amount: 500, accountId: bank, ...row }).run();

describe("lastTypedAccountId", () => {
  it("is null on an empty book", () => {
    expect(lastTypedAccountId(h.db, "expense")).toBeNull();
  });

  it("follows the last hand-typed entry of the same type", () => {
    put({ accountId: bank });
    put({ accountId: wallet });
    expect(lastTypedAccountId(h.db, "expense")).toBe(wallet);
    put({ type: "income", accountId: bank });
    expect(lastTypedAccountId(h.db, "expense")).toBe(wallet);
    expect(lastTypedAccountId(h.db, "income")).toBe(bank);
  });

  it("ignores bank imports, however recent", () => {
    put({ accountId: bank });
    put({ accountId: wallet, importKey: `k-${++n}` });
    expect(lastTypedAccountId(h.db, "expense")).toBe(bank);
  });

  it("ignores transfers", () => {
    put({ accountId: bank });
    put({ type: "transfer", accountId: wallet, toAccountId: bank });
    expect(lastTypedAccountId(h.db, "expense")).toBe(bank);
  });
});
