import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireEntry } from "@/lib/entry-shape";
import { createNetwork, isGatewayFailure, within } from "@/lib/offline/network";

// How the phone talks to the PC, with a pretend `fetch`: every way the PC can answer, or not.

const entry: WireEntry = { clientId: "client-aaaa-1", type: "expense", amount: 100, date: "2026-10-11", accountId: 1, toAccountId: null, categoryId: 2, item: null, note: null };
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
/** A response as fetch hands it over after following a redirect (a constructed Response can't say so itself). */
const via = (res: Response, over: { url: string; redirected: boolean }) => Object.defineProperties(res, { url: { value: over.url }, redirected: { value: over.redirected } });
type Reply = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const net = (reply: Reply) => createNetwork(reply as typeof fetch);
/** A PC that accepts the connection and never answers, until the phone gives up (aborts). */
const silent: Reply = (_input, init) =>
  new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

afterEach(() => vi.useRealTimers());

describe("what counts as 'the app isn't there'", () => {
  it("is what a proxy says when the app behind it is down, and nothing the app says itself", () => {
    expect([502, 503, 504].every(isGatewayFailure)).toBe(true);
    expect([200, 204, 302, 400, 401, 404, 500].some(isGatewayFailure)).toBe(false);
  });
});

describe("sending entries (post)", () => {
  it("posts them as JSON to the sync address, never cached", async () => {
    const reply = vi.fn<Reply>(async () => json({ results: [] }));
    await net(reply).post([entry]);
    const [input, init] = reply.mock.calls[0];
    expect(input).toBe("/sync/entries");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", headers: { "content-type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toEqual({ entries: [entry] });
  });

  it("hands back the PC's verdicts", async () => {
    const results = [{ clientId: entry.clientId, status: "saved", id: 7 }];
    expect(await net(async () => json({ results })).post([entry])).toEqual({ kind: "results", results });
  });

  it.each([502, 503, 504])("a proxy saying the app isn't there (%i) is 'can't reach', not an error from the PC", async (status) => {
    expect(await net(async () => new Response("Bad Gateway", { status })).post([entry])).toEqual({ kind: "unreachable" });
  });

  it("an error from the app itself is an error, with its status", async () => {
    expect(await net(async () => json({ error: "boom" }, { status: 500 })).post([entry])).toEqual({ kind: "error", status: 500 });
    expect(await net(async () => new Response("<html>hi</html>", { headers: { "content-type": "text/html" } })).post([entry])).toEqual({ kind: "error", status: 200 });
    expect(await net(async () => json({ nothing: true })).post([entry])).toEqual({ kind: "error", status: 200 });
  });

  it("being sent to the login page means 'sign in again'", async () => {
    const login = via(new Response("<html>PIN</html>", { headers: { "content-type": "text/html" } }), { url: "https://pc.test/login?next=%2F", redirected: true });
    expect(await net(async () => login).post([entry])).toEqual({ kind: "login" });
  });

  it("a refused connection, or no network at all, is 'can't reach'", async () => {
    expect(
      await net(async () => {
        throw new TypeError("Failed to fetch");
      }).post([entry]),
    ).toEqual({ kind: "unreachable" });
  });

  it("gives up on a PC that never answers: after twenty seconds, or the time it is told", async () => {
    vi.useFakeTimers();
    const slow = net(silent);
    let outcome: unknown;
    void slow.post([entry]).then((o) => (outcome = o));
    await vi.advanceTimersByTimeAsync(19_999);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toEqual({ kind: "unreachable" });

    let quick: unknown;
    void slow.post([entry], { timeoutMs: 6000 }).then((o) => (quick = o));
    await vi.advanceTimersByTimeAsync(6000);
    expect(quick).toEqual({ kind: "unreachable" });
  });
});

describe("is the PC there? (probe)", () => {
  it("yes, for any answer from the app: fine, an error of its own, or the login page", async () => {
    expect(await net(async () => new Response("ok")).probe()).toBe(true);
    expect(await net(async () => new Response("boom", { status: 500 })).probe()).toBe(true);
    expect(await net(async () => via(new Response("PIN"), { url: "https://pc.test/login", redirected: true })).probe()).toBe(true);
  });

  it.each([502, 503, 504])("no, when only its proxy answers (%i): that is the app being down", async (status) => {
    expect(await net(async () => new Response("Bad Gateway", { status })).probe()).toBe(false);
  });

  it("no, for a refused connection or no network", async () => {
    expect(
      await net(async () => {
        throw new TypeError("Failed to fetch");
      }).probe(),
    ).toBe(false);
  });

  it("no, after four seconds of silence, and not before", async () => {
    vi.useFakeTimers();
    let answer: boolean | undefined;
    void net(silent).probe().then((a) => (answer = a));
    await vi.advanceTimersByTimeAsync(3_999);
    expect(answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(answer).toBe(false);
  });

  it("asks the ping address, never cached", async () => {
    const reply = vi.fn<Reply>(async () => new Response("ok"));
    await net(reply).probe();
    expect(reply.mock.calls[0][0]).toBe("/ping");
    expect(reply.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });
});

describe("within", () => {
  it("returns what the job returns, the fallback if it throws, and aborts it when time is up", async () => {
    expect(await within(100, "fallback", async () => "done")).toBe("done");
    expect(
      await within(100, "fallback", async () => {
        throw new Error("no");
      }),
    ).toBe("fallback");
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const p = within(50, "late", (s) => ((signal = s), new Promise<string>((_r, reject) => s.addEventListener("abort", () => reject(new Error("x"))))));
    await vi.advanceTimersByTimeAsync(50);
    expect(await p).toBe("late");
    expect(signal?.aborted).toBe(true);
  });
});
