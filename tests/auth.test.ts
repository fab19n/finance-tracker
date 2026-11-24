import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AUTH_COOKIE, authToken, safeEqual, verifyToken } from "@/lib/auth-token";

const jar = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn(), get: vi.fn() }));
const hdrs = vi.hoisted(() => ({ proto: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => jar,
  headers: async () => ({ get: (k: string) => (k === "x-forwarded-proto" ? hdrs.proto : null) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const SECRET = "ab".repeat(32);
let secretDir = "";
/** A token the way the server would issue it now. */
const tok = async (pin: string) => (await import("@/lib/session")).issueSession(pin);

beforeEach(() => {
  secretDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-session-"));
  process.env.SESSION_SECRET_FILE = path.join(secretDir, "session-secret");
  hdrs.proto = null;
  delete (globalThis as { __mtThrottle?: unknown }).__mtThrottle;
  vi.resetModules(); // login()'s lockout counter is module state: start every test fresh
  jar.set.mockReset();
  jar.delete.mockReset();
  jar.get.mockReset();
});
afterEach(() => {
  delete process.env.APP_PIN;
  delete process.env.SESSION_SECRET_FILE;
  fs.rmSync(secretDir, { recursive: true, force: true });
  vi.useRealTimers();
});

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
async function redirected(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m.startsWith("NEXT_REDIRECT:")) return m.slice("NEXT_REDIRECT:".length);
    throw e;
  }
}

describe("session token", () => {
  it("is '<expiry>.<64 hex>', never contains the PIN, and depends on the PIN and the secret", async () => {
    const now = Date.UTC(2026, 10, 1);
    const a = await authToken("482915", SECRET, now);
    expect(a).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(await authToken("482915", SECRET, now)).toBe(a);
    expect(await authToken("482916", SECRET, now)).not.toBe(a);
    expect(await authToken("482915", "cd".repeat(32), now)).not.toBe(a);
    expect(a).not.toContain("482915");
  });
  it("verifies for 30 days, then expires on the server", async () => {
    const now = Date.UTC(2026, 10, 1);
    const t = await authToken("482915", SECRET, now);
    expect(await verifyToken(t, "482915", SECRET, now + 29 * 86400_000)).toBe(true);
    expect(await verifyToken(t, "482915", SECRET, now + 31 * 86400_000)).toBe(false);
  });
  it("rejects a changed PIN, another secret, an edited expiry, a far-future expiry and junk", async () => {
    const now = Date.UTC(2026, 10, 1);
    const t = await authToken("482915", SECRET, now);
    expect(await verifyToken(t, "111111", SECRET, now)).toBe(false);
    expect(await verifyToken(t, "482915", "cd".repeat(32), now)).toBe(false);
    const [exp, mac] = t.split(".");
    expect(await verifyToken(`${Number(exp) + 999999}.${mac}`, "482915", SECRET, now)).toBe(false);
    expect(await verifyToken(undefined, "482915", SECRET, now)).toBe(false);
    for (const junk of ["", "deadbeef", ".", `${exp}.`, `abc.${mac}`, mac]) expect(await verifyToken(junk, "482915", SECRET, now)).toBe(false);
  });
  it("cannot be derived from the PIN alone: a guess-the-PIN table computed without the secret never matches", async () => {
    const now = Date.now();
    const real = await authToken("482915", SECRET, now);
    for (let i = 482910; i < 482920; i++) {
      const guess = await authToken(String(i), "guess", now); // an attacker who does not know the secret
      expect(await verifyToken(guess, "482915", SECRET, now)).toBe(false);
    }
    expect(real).not.toBe(await authToken("482915", "guess", now));
  });
  it("safeEqual compares exactly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("proxy gate", () => {
  const req = (path: string, cookie?: string) =>
    new NextRequest(`http://192.168.1.20:3000${path}`, cookie ? { headers: { cookie: `${AUTH_COOKIE}=${cookie}` } } : undefined);
  const isPassThrough = (r: Response) => r.headers.get("x-middleware-next") === "1";

  it("does nothing when no PIN is configured (local-only default)", async () => {
    const { proxy } = await import("@/proxy");
    expect(isPassThrough(await proxy(req("/dashboard")))).toBe(true);
  });

  it("redirects to /login, remembering where you were going", async () => {
    process.env.APP_PIN = "482915";
    const { proxy } = await import("@/proxy");
    const r = await proxy(req("/transactions?month=2026-09"));
    expect(r.status).toBe(307);
    const loc = new URL(r.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/transactions?month=2026-09");
  });

  it("lets a valid session through, and rejects forged or stale ones", async () => {
    process.env.APP_PIN = "482915";
    const { proxy } = await import("@/proxy");
    expect(isPassThrough(await proxy(req("/dashboard", await tok("482915"))))).toBe(true);
    expect((await proxy(req("/dashboard", "deadbeef"))).status).toBe(307);
    expect((await proxy(req("/dashboard", await tok("111111")))).status).toBe(307); // cookie from an old PIN
  });

  it("always lets the login page itself load", async () => {
    process.env.APP_PIN = "482915";
    const { proxy } = await import("@/proxy");
    expect(isPassThrough(await proxy(req("/login")))).toBe(true);
  });

  it("only guards what it should: the matcher skips static assets, the manifest and icons", async () => {
    const { config } = await import("@/proxy");
    const re = new RegExp(`^${config.matcher[0]}$`);
    for (const open of ["/_next/static/chunks/a.js", "/manifest.webmanifest", "/pwa/icon-192.png", "/favicon.ico"]) expect(re.test(open)).toBe(false);
    for (const guarded of ["/", "/dashboard", "/settings/backup", "/transactions/export"]) expect(re.test(guarded)).toBe(true);
  });
});

describe("login action", () => {
  it("rejects a wrong PIN without setting a cookie", async () => {
    process.env.APP_PIN = "482915";
    const { login } = await import("@/app/actions/auth");
    expect(await login({}, form({ pin: "000000", next: "/" }))).toEqual({ error: "That PIN isn't right." });
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("accepts the right PIN: sets an httpOnly cookie and goes where you were headed", async () => {
    process.env.APP_PIN = "482915";
    const { login } = await import("@/app/actions/auth");
    expect(await redirected(login({}, form({ pin: "482915", next: "/insights" })))).toBe("/insights");
    const [name, value, opts] = jar.set.mock.calls[0];
    expect(name).toBe(AUTH_COOKIE);
    expect(await (await import("@/lib/session")).checkSession(value, "482915")).toBe(true);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it.each(["//evil.example.com", "/\\evil.example.com", "/\\\\evil.example.com", "https://evil.example.com", "javascript:alert(1)", "/ok\nSet-Cookie: x=1", ""])(
    "never redirects off-site after login (next=%j)",
    async (next) => {
      process.env.APP_PIN = "482915";
      const { login } = await import("@/app/actions/auth");
      expect(await redirected(login({}, form({ pin: "482915", next })))).toBe("/dashboard");
    },
  );

  it("locks out guessing after 5 wrong PINs, says how long, and refuses even the right PIN", async () => {
    vi.useFakeTimers();
    process.env.APP_PIN = "482915";
    const { login } = await import("@/app/actions/auth");
    for (let i = 0; i < 5; i++) await login({}, form({ pin: String(i).repeat(6), next: "/" }));
    const locked = await login({}, form({ pin: "482915", next: "/" }));
    expect(locked.error).toMatch(/Too many wrong attempts\. Try again in \d+ s\./);
    expect(jar.set).not.toHaveBeenCalled();

    vi.advanceTimersByTime(61_000);
    expect(await redirected(login({}, form({ pin: "482915", next: "/" })))).toBe("/");
    expect(jar.set).toHaveBeenCalledTimes(1);
  });

  it("a burst of parallel guesses gets at most 5 verdicts, the rest are refused", async () => {
    process.env.APP_PIN = "482915";
    const { login } = await import("@/app/actions/auth");
    const results = await Promise.all(Array.from({ length: 200 }, (_, i) => login({}, form({ pin: String(100000 + i), next: "/" }))));
    expect(results.filter((r) => r.error === "That PIN isn't right.")).toHaveLength(5);
    expect(results.filter((r) => /Too many wrong attempts/.test(r.error ?? ""))).toHaveLength(195);
  });

  it("sets the secure flag only behind HTTPS", async () => {
    process.env.APP_PIN = "482915";
    const { login } = await import("@/app/actions/auth");
    hdrs.proto = "https";
    await redirected(login({}, form({ pin: "482915", next: "/" })));
    expect(jar.set.mock.calls[0][2]).toMatchObject({ secure: true });
    jar.set.mockReset();
    hdrs.proto = "http";
    await redirected(login({}, form({ pin: "482915", next: "/" })));
    expect(jar.set.mock.calls[0][2]).toMatchObject({ secure: false });
  });

  it("logout clears the cookie", async () => {
    const { logout } = await import("@/app/actions/auth");
    expect(await redirected(logout())).toBe("/login");
    expect(jar.delete).toHaveBeenCalledWith(AUTH_COOKIE);
  });
});

describe("requireAuth (the second lock, inside getDb)", () => {
  it("is a no-op without a PIN, redirects with a missing/bad cookie, passes with a good one", async () => {
    const { requireAuth } = await import("@/lib/auth");
    await expect(requireAuth()).resolves.toBeUndefined();

    process.env.APP_PIN = "482915";
    jar.get.mockReturnValue(undefined);
    expect(await redirected(requireAuth())).toBe("/login");
    jar.get.mockReturnValue({ value: "forged" });
    expect(await redirected(requireAuth())).toBe("/login");
    jar.get.mockReturnValue({ value: await tok("482915") });
    await expect(requireAuth()).resolves.toBeUndefined();
  });
});
