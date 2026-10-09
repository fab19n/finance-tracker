import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AUTH_COOKIE, authToken, safeEqual } from "@/lib/auth-token";

const jar = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn(), get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

beforeEach(() => {
  vi.resetModules(); // login()'s lockout counter is module state: start every test fresh
  jar.set.mockReset();
  jar.delete.mockReset();
  jar.get.mockReset();
});
afterEach(() => {
  delete process.env.APP_PIN;
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
  it("is a stable 64-char hex HMAC that depends on the PIN", async () => {
    const a = await authToken("482915");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await authToken("482915")).toBe(a);
    expect(await authToken("482916")).not.toBe(a);
    expect(a).not.toContain("482915"); // the PIN itself is never in the cookie
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
    expect(isPassThrough(await proxy(req("/dashboard", await authToken("482915"))))).toBe(true);
    expect((await proxy(req("/dashboard", "deadbeef"))).status).toBe(307);
    expect((await proxy(req("/dashboard", await authToken("111111")))).status).toBe(307); // cookie from an old PIN
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
    expect(value).toBe(await authToken("482915"));
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it.each(["//evil.example.com", "https://evil.example.com", "javascript:alert(1)", ""])(
    "never redirects off-site after login (next=%j)",
    async (next) => {
      process.env.APP_PIN = "482915";
      const { login } = await import("@/app/actions/auth");
      expect(await redirected(login({}, form({ pin: "482915", next })))).toBe("/");
    },
  );

  it("locks out guessing after 5 wrong PINs - even the right PIN is refused for a minute", async () => {
    vi.useFakeTimers();
    process.env.APP_PIN = "482915";
    const { login } = await import("@/app/actions/auth");
    for (let i = 0; i < 5; i++) await login({}, form({ pin: String(i).repeat(6), next: "/" }));
    expect((await login({}, form({ pin: "482915", next: "/" }))).error).toMatch(/Too many wrong attempts/);
    expect(jar.set).not.toHaveBeenCalled();

    vi.advanceTimersByTime(61_000);
    expect(await redirected(login({}, form({ pin: "482915", next: "/" })))).toBe("/");
    expect(jar.set).toHaveBeenCalledTimes(1);
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
    jar.get.mockReturnValue({ value: await authToken("482915") });
    await expect(requireAuth()).resolves.toBeUndefined();
  });
});
