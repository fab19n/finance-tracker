import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/db/open";
import { accounts, categories, transactions } from "@/db/schema";
import { entryShapeError } from "@/lib/entry-shape";

// The PC's side of the phone's outbox, against a real in-memory database. Only Next's plumbing is stubbed.
const h = vi.hoisted(() => ({ db: null as unknown as DB, revalidate: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: async () => h.db }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("next/server", () => ({ connection: async () => {} })); // only meaningful inside a real request
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

let ids: { bank: number; cash: number; food: number; salary: number };
let n = 0;

beforeEach(async () => {
  const { openDb } = await import("@/db/open");
  h.db = openDb(":memory:");
  h.revalidate.mockReset();
  const a = h.db.select().from(accounts).all();
  const c = h.db.select().from(categories).all();
  ids = {
    bank: a.find((x) => x.type === "bank")!.id,
    cash: a.find((x) => x.type === "cash")!.id,
    food: c.find((x) => x.name === "Eating Out")!.id,
    salary: c.find((x) => x.name === "Salary")!.id,
  };
});

const rows = () => h.db.select().from(transactions).all();

/** An entry the way the phone sends it. */
const entry = (over: Record<string, unknown> = {}) => ({
  clientId: `phone-${++n}-aaaa`,
  type: "expense",
  amount: 1250,
  date: "2026-10-11",
  accountId: ids.cash,
  toAccountId: null,
  categoryId: ids.food,
  item: "  Teh tarik ",
  note: null,
  ...over,
});

async function send(body: unknown, headers: Record<string, string> = {}) {
  const { POST } = await import("@/app/sync/entries/route");
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return POST(new Request("http://localhost/sync/entries", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: text }));
}
const verdicts = async (body: unknown) => ((await (await send(body)).json()) as { results: { clientId: string; status: string; id?: number; error?: string }[] }).results;

describe("POST /sync/entries", () => {
  it("saves each entry in exact sen, tagged with the phone's id, and says so", async () => {
    const a = entry();
    const b = entry({ type: "income", amount: 650_000, categoryId: ids.salary, accountId: ids.bank, item: null });
    const c = entry({ type: "transfer", amount: 20_000, accountId: ids.bank, toAccountId: ids.cash, categoryId: ids.food, item: null });
    const res = await verdicts({ entries: [a, b, c] });
    expect(res.map((r) => r.status)).toEqual(["saved", "saved", "saved"]);
    expect(rows()).toMatchObject([
      { id: res[0].id, type: "expense", amount: 1250, clientId: a.clientId, item: "Teh tarik", categoryId: ids.food, toAccountId: null },
      { type: "income", amount: 650_000, clientId: b.clientId, categoryId: ids.salary },
      { type: "transfer", amount: 20_000, clientId: c.clientId, toAccountId: ids.cash, categoryId: null },
    ]);
  });

  it("is the same row the Add form makes: one rule book for both ways in", async () => {
    const { saveTransaction } = await import("@/app/actions/transactions");
    const f = new FormData();
    for (const [k, v] of Object.entries({ type: "expense", amount: "12.50", date: "2026-10-11", accountId: String(ids.cash), categoryId: String(ids.food), item: "  Teh tarik " })) f.set(k, v);
    await saveTransaction({ ok: false }, f);
    await verdicts({ entries: [entry()] });
    const [fromForm, fromPhone] = rows();
    // everything but what is assigned on the way in: the row's number, when it was made, and the phone's tag
    const same = (r: typeof fromForm) => Object.fromEntries(Object.entries(r).filter(([k]) => !["id", "createdAt", "clientId"].includes(k)));
    expect(same(fromPhone)).toEqual(same(fromForm));
    expect(fromForm.clientId).toBeNull();
  });

  it("is safe to send again: a repeat is 'duplicate', with the same id, and writes nothing", async () => {
    const e = entry();
    const [first] = await verdicts({ entries: [e] });
    h.revalidate.mockReset();
    const [again] = await verdicts({ entries: [e] });
    expect(first.status).toBe("saved");
    expect(again).toMatchObject({ status: "duplicate", id: first.id });
    expect(rows()).toHaveLength(1);
    expect(h.revalidate).not.toHaveBeenCalled(); // nothing changed, so nothing to refresh
  });

  it("gives every entry its own verdict, so a good one is never held up by a bad one", async () => {
    const good = entry();
    const wrongKind = entry({ categoryId: ids.salary });
    const noCategory = entry({ categoryId: null });
    const gone = entry({ accountId: 9999 });
    const res = await verdicts({ entries: [wrongKind, good, noCategory, gone] });
    expect(res.map((r) => r.status)).toEqual(["rejected", "saved", "rejected", "rejected"]);
    expect(res[0].error).toMatch(/doesn't match/);
    expect(res[2].error).toMatch(/Pick a category/);
    expect(res[3].error).toMatch(/no longer exists/);
    expect(rows().map((r) => r.clientId)).toEqual([good.clientId]);
  });

  it("says plainly when a category or account has been deleted since the phone last looked", async () => {
    const doomed = h.db.insert(categories).values({ name: "Short-lived", type: "expense", nature: "want", color: "#000000", icon: "x" }).returning({ id: categories.id }).get().id;
    h.db.delete(categories).where(eq(categories.id, doomed)).run();
    const res = await verdicts({ entries: [entry({ categoryId: doomed }), entry({ type: "transfer", accountId: ids.bank, toAccountId: 9999, categoryId: null })] });
    expect(res.map((r) => r.error)).toEqual(["That category no longer exists", "That account no longer exists"]);
  });

  it.each([
    ["a zero amount", () => ({ amount: 0 }), /amount greater than 0/],
    ["a fractional amount (sen are whole)", () => ({ amount: 12.5 }), /amount greater than 0/],
    ["an impossible date", () => ({ date: "2026-02-31" }), /valid date/],
    ["a date in the wrong shape", () => ({ date: "11/10/2026" }), /valid date/],
    ["a transfer to the same account", () => ({ type: "transfer", toAccountId: ids.cash, categoryId: null }), /must differ/],
  ])("rejects %s, one entry only", async (_label, over, message) => {
    const bad = entry(over());
    const res = await verdicts({ entries: [bad, entry()] });
    expect(res.map((r) => r.status)).toEqual(["rejected", "saved"]);
    expect(res[0].error).toMatch(message);
  });

  it("refreshes the pages only when something was actually written", async () => {
    await verdicts({ entries: [entry({ amount: 0 })] });
    expect(h.revalidate).not.toHaveBeenCalled();
    await verdicts({ entries: [entry()] });
    expect(h.revalidate).toHaveBeenCalledWith("/", "layout");
  });

  describe("refuses a request that isn't the phone's outbox", () => {
    it("not JSON, wrong content type, cross-site, empty, too many, or the wrong shape", async () => {
      expect((await send("not json at all")).status).toBe(400);
      expect((await send({ entries: [entry()] }, { "content-type": "text/plain" })).status).toBe(415);
      expect((await send({ entries: [entry()] }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
      expect((await send({ entries: [] })).status).toBe(400);
      expect((await send({ entries: Array.from({ length: 51 }, () => entry()) })).status).toBe(400);
      expect((await send({ entries: [{ ...entry(), amount: "12.50" }] })).status).toBe(400);
      expect((await send({ entries: [{ ...entry(), clientId: "x" }] })).status).toBe(400);
      expect((await send({ entries: [entry()] }, { "content-length": "999999" })).status).toBe(413);
      expect(rows()).toHaveLength(0);
    });
    it("but takes same-site and plain requests", async () => {
      expect((await send({ entries: [entry()] }, { "sec-fetch-site": "same-origin" })).status).toBe(200);
    });
  });

  it("never caches a verdict", async () => {
    expect((await send({ entries: [entry()] })).headers.get("cache-control")).toBe("no-store");
  });
});

describe("transactions.client_id (migration 0007)", () => {
  it("lets any number of entries have none, but never two with the same id", () => {
    const base = { date: "2026-10-11", type: "expense" as const, amount: 100, accountId: ids.cash };
    h.db.insert(transactions).values([{ ...base }, { ...base }, { ...base, clientId: null }]).run();
    h.db.insert(transactions).values({ ...base, clientId: "same-id-1" }).run();
    expect(() => h.db.insert(transactions).values({ ...base, clientId: "same-id-1" }).run()).toThrow(/UNIQUE/i);
    expect(rows()).toHaveLength(4);
  });
  it("is a unique index on exactly that column", () => {
    const idx = h.db.all<{ name: string; unique: number }>(sql`SELECT name, "unique" FROM pragma_index_list('transactions') WHERE name = 'tx_client_id_idx'`);
    expect(idx).toEqual([{ name: "tx_client_id_idx", unique: 1 }]);
  });
});

describe("GET /ping", () => {
  it("answers from the live server, with nothing about your data, uncached", async () => {
    const { GET } = await import("@/app/ping/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("entryShapeError (what the phone checks before it queues anything)", () => {
  const ok = { type: "expense" as const, amount: 100, date: "2026-10-11", accountId: 1, toAccountId: null, categoryId: 2 };
  it("passes a good entry of each kind", () => {
    expect(entryShapeError(ok)).toBeNull();
    expect(entryShapeError({ ...ok, type: "income" })).toBeNull();
    expect(entryShapeError({ ...ok, type: "transfer", toAccountId: 3, categoryId: null })).toBeNull();
  });
  it("names the first thing wrong, in the words the form has always used", () => {
    expect(entryShapeError({ ...ok, date: "soon" })).toBe("Pick a valid date");
    expect(entryShapeError({ ...ok, amount: 0 })).toBe("Enter an amount greater than 0");
    expect(entryShapeError({ ...ok, accountId: 0 })).toBe("Pick an account");
    expect(entryShapeError({ ...ok, categoryId: null })).toBe("Pick a category");
    expect(entryShapeError({ ...ok, type: "transfer", toAccountId: null })).toBe("Pick the account the money goes to");
    expect(entryShapeError({ ...ok, type: "transfer", toAccountId: 1 })).toBe("From and To accounts must differ");
  });
});
