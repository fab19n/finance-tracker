import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "@/app/manifest";
import { config } from "@/proxy";

// The phone app. None of it needs a browser: the manifest is a function, the PIN proxy publishes the paths it skips, and
// the service worker is a plain script that can run against a stand-in for the worker environment.

/** Does the PIN proxy run for this path? (Next applies `config.matcher` first, and calls proxy() only on a match.) */
const gated = (pathname: string) => new RegExp(`^${config.matcher[0]}$`).test(pathname);

describe("the web app manifest", () => {
  const m = manifest();

  it("meets Chrome's install criteria", () => {
    expect(m.name || m.short_name).toBeTruthy();
    expect(m.start_url).toBe("/");
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(m.display);
    const png = (m.icons ?? []).filter((i) => i.type === "image/png").map((i) => i.sizes);
    expect(png).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.prefer_related_applications).not.toBe(true);
  });

  it("names only files the PIN lock lets through, because a browser fetches them without the login cookie", () => {
    expect(gated("/manifest.webmanifest")).toBe(false);
    for (const icon of m.icons ?? []) expect(gated(icon.src), icon.src).toBe(false);
  });
});

describe("the PIN lock and the phone app", () => {
  it("never stands in front of the files a phone needs to install the app and to say it can't reach the PC", () => {
    for (const p of ["/manifest.webmanifest", "/pwa/icon-180.png", "/pwa/icon-192.png", "/pwa/icon-512.png", "/pwa/icon.svg", "/favicon.ico", "/sw.js", "/offline.html"]) {
      expect(gated(p), p).toBe(false);
    }
  });

  it("still guards every real page and every data endpoint, including the phone's sync and ping", () => {
    for (const p of ["/", "/dashboard", "/transactions", "/transactions/lookalikes", "/transactions/export", "/settings/backup", "/plan/shared", "/sync/entries", "/ping"]) {
      expect(gated(p), p).toBe(true);
    }
  });
});

describe("the offline page (public/offline.html)", () => {
  const html = readFileSync(path.join(process.cwd(), "public/offline.html"), "utf8");

  it("needs nothing else to display: it is shown precisely when nothing can be fetched", () => {
    expect(html).not.toMatch(/\b(?:src|href)\s*=/i);
    expect(html).not.toMatch(/@import|url\(/i);
  });

  it("tells you what to check, and lets you retry or go to the one page that always works", () => {
    expect(html).toMatch(/PC on and awake/);
    expect(html).toMatch(/Tailscale/);
    expect(html).toMatch(/location\.reload\(\)/);
    expect(html).toMatch(/location\.assign\('\/'\)/);
  });
});

// ---- the service worker ------------------------------------------------------------------------------------------------

const ORIGIN = "https://pc.test";
type Listener = (event: Record<string, unknown>) => void;
type Asked = string | { url: string };

const pathOf = (r: Asked) => {
  const u = new URL(typeof r === "string" ? r : r.url, ORIGIN);
  return u.pathname + u.search;
};
const html = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
const script = () => new Response("code", { status: 200, headers: { "content-type": "application/javascript" } });

/** A pretend PC behind the worker. */
function pretendPc() {
  const pc = {
    up: true,
    /** Accepts the connection and then never answers: a PC that is asleep. */
    silent: false,
    pages: new Map<string, string>([["/offline.html", "<html><head></head><body>offline</body></html>"]]),
    assets: new Set<string>(),
    asked: [] as string[],
    custom: new Map<string, () => Response>(),
  };
  const network = async (request: Asked): Promise<Response> => {
    const p = pathOf(request);
    pc.asked.push(p);
    if (!pc.up) throw new TypeError("Failed to fetch");
    if (pc.silent && p !== "/offline.html") return new Promise<Response>(() => {});
    const custom = pc.custom.get(p);
    if (custom) return custom();
    if (pc.assets.has(p)) return script();
    const body = pc.pages.get(p);
    return body === undefined ? new Response("not found", { status: 404 }) : html(body);
  };
  return { pc, network };
}

function loadWorker(network: (request: Asked) => Promise<Response>) {
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (r: Asked) => new URL(typeof r === "string" ? r : r.url, ORIGIN).href;
  const cacheNamed = (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      put: async (r: Asked, res: Response) => void store.set(keyOf(r), res),
      match: async (r: Asked) => store.get(keyOf(r))?.clone(),
      keys: async () => [...store.keys()].map((url) => ({ url })),
      delete: async (r: Asked) => store.delete(keyOf(r)),
      add: async (r: Asked) => void store.set(keyOf(r), await network(r)),
    };
  };
  const caches = {
    open: async (name: string) => cacheNamed(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (r: Asked) => {
      for (const s of stores.values()) {
        const hit = s.get(keyOf(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  class FakeRequest {
    constructor(
      public url: string,
      public init?: unknown,
    ) {}
  }
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  vm.runInNewContext(readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8"), {
    self,
    caches,
    fetch: network,
    Request: FakeRequest,
    Response,
    Headers,
    URL,
    // The worker runs in its own realm: hand it the (possibly faked) clock, or it would read the real one.
    Date,
    setTimeout,
    clearTimeout,
  });
  const names = () => [...stores.keys()];
  const cache = (startsWith: string) => stores.get(names().find((n) => n.startsWith(startsWith)) ?? "");
  return { listeners, stores, self, caches, names, cache };
}
type Worker = ReturnType<typeof loadWorker>;

function fire(worker: Worker, type: string, event: Record<string, unknown> = {}) {
  const waits: Promise<unknown>[] = [];
  let responded: Promise<unknown> | undefined;
  worker.listeners.get(type)!({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p), respondWith: (p: Promise<unknown>) => (responded = p) });
  return {
    // As in a browser: the worker only asks to be kept alive for its saving AFTER it has an answer, so wait for the answer first.
    settled: async () => {
      await Promise.resolve(responded).catch(() => {});
      await Promise.all(waits);
    },
    responded,
  };
}
const navigate = (p: string) => ({ request: { method: "GET", mode: "navigate", url: `${ORIGIN}${p}` } });
const subrequest = (p: string, over: Record<string, unknown> = {}) => ({ request: { method: "GET", mode: "cors", url: `${ORIGIN}${p}`, ...over } });

async function installed(extra: (pc: ReturnType<typeof pretendPc>["pc"]) => void = () => {}) {
  const { pc, network } = pretendPc();
  extra(pc);
  const worker = loadWorker(network);
  await fire(worker, "install").settled();
  return { pc, worker };
}
const text = async (r: unknown) => (r as Response).text();

describe("the service worker (public/sw.js)", () => {
  afterEach(() => vi.useRealTimers());

  describe("setting up", () => {
    it("keeps the offline page when it installs, and takes over at once", async () => {
      const { worker } = await installed();
      expect([...(worker.cache("money-tracker-shell")?.keys() ?? [])]).toEqual([`${ORIGIN}/offline.html`]);
      expect(worker.self.skipWaiting).toHaveBeenCalled();
    });

    it("clears out caches it doesn't own (older versions') and keeps its own", async () => {
      const { worker } = await installed();
      await worker.caches.open("money-tracker-offline-v1"); // the first version's cache
      await worker.caches.open("something-else");
      await fire(worker, "activate").settled();
      expect(worker.names()).toEqual([expect.stringContaining("shell")]);
      expect(worker.self.clients.claim).toHaveBeenCalled();
    });
  });

  describe("opening a page", () => {
    it("shows what the PC says, and keeps a copy, stamped with when", async () => {
      vi.useFakeTimers({ now: 1_700_000_000_000 });
      const { pc, worker } = await installed((pc) => pc.pages.set("/dashboard", "<html><head></head><body>fresh</body></html>"));
      const event = fire(worker, "fetch", navigate("/dashboard"));
      expect(await text(await event.responded)).toContain("fresh");
      await event.settled();
      const kept = await worker.cache("money-tracker-pages")!.get(`${ORIGIN}/dashboard`)!.clone();
      expect(kept.headers.get("x-saved-at")).toBe("1700000000000");
      expect(await kept.text()).toContain("fresh");
      expect(pc.asked).toContain("/dashboard");
    });

    it("keeps only real pages: not a redirect, an error, something that isn't a page, or the login page", async () => {
      const redirected = () => Object.defineProperty(html("<html></html>"), "redirected", { value: true });
      const { worker } = await installed((pc) => {
        pc.custom.set("/moved", redirected);
        pc.custom.set("/data", () => new Response("{}", { headers: { "content-type": "application/json" } }));
        pc.pages.set("/login", "<html><head></head><body>PIN</body></html>");
      });
      for (const p of ["/moved", "/missing", "/data", "/login"]) {
        const event = fire(worker, "fetch", navigate(p));
        await event.responded;
        await event.settled();
      }
      expect(worker.cache("money-tracker-pages")?.size ?? 0).toBe(0);
    });

    it("with the PC gone, shows the last copy, and tells the page it is a copy and from when", async () => {
      vi.useFakeTimers({ now: 1_700_000_000_000 });
      const { pc, worker } = await installed((pc) => pc.pages.set("/transactions", "<html><head><title>x</title></head><body>old data</body></html>"));
      await fire(worker, "fetch", navigate("/transactions")).settled();
      pc.up = false;
      const copy = (await fire(worker, "fetch", navigate("/transactions")).responded) as Response;
      const body = await copy.text();
      expect(copy.status).toBe(200);
      expect(copy.headers.get("content-type")).toContain("text/html");
      expect(copy.headers.get("content-encoding")).toBeNull();
      expect(body).toContain("old data");
      expect(body).toContain("<script>window.__MT_SAVED_AT=1700000000000;</script></head>");
    });

    it("a PC that never answers (asleep) gets four seconds, then the saved copy", async () => {
      vi.useFakeTimers();
      const { pc, worker } = await installed((pc) => pc.pages.set("/", "<html><head></head><body>home</body></html>"));
      await fire(worker, "fetch", navigate("/")).settled();
      pc.silent = true;
      const { responded } = fire(worker, "fetch", navigate("/"));
      let settled = false;
      void responded!.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(3_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await text(await responded)).toContain("home");
    });

    it.each([502, 503, 504])(
      "a proxy saying the app isn't running (%i) is silence: it shows the saved copy, not the proxy's error, and keeps nothing",
      async (status) => {
        const { pc, worker } = await installed((pc) => pc.pages.set("/plan", "<html><head></head><body>plan as saved</body></html>"));
        await fire(worker, "fetch", navigate("/plan")).settled();
        pc.custom.set("/plan", () => new Response("Bad Gateway", { status }));
        const event = fire(worker, "fetch", navigate("/plan"));
        const shown = await text(await event.responded);
        await event.settled();
        expect(shown).toContain("plan as saved");
        expect(shown).not.toContain("Bad Gateway");
        // and the saved copy itself is still the real page, not the error
        pc.up = false;
        expect(await text(await fire(worker, "fetch", navigate("/plan")).responded)).toContain("plan as saved");
      },
    );

    it("with nothing saved, a proxy's error gives the offline page too", async () => {
      const { pc, worker } = await installed();
      pc.custom.set("/invest", () => new Response("Bad Gateway", { status: 502 }));
      expect(await text(await fire(worker, "fetch", navigate("/invest")).responded)).toContain("offline");
    });

    it("but an error the app itself gives is shown as it is, never hidden behind an old copy", async () => {
      const { pc, worker } = await installed((pc) => pc.pages.set("/plan", "<html><head></head><body>plan as saved</body></html>"));
      await fire(worker, "fetch", navigate("/plan")).settled();
      pc.custom.set("/plan", () => new Response("<html>the app broke</html>", { status: 500, headers: { "content-type": "text/html" } }));
      expect(await text(await fire(worker, "fetch", navigate("/plan")).responded)).toContain("the app broke");
    });

    it("once the app has found the PC gone, a tap on a tab waits under a second, not four; and is told when it is back", async () => {
      vi.useFakeTimers();
      const { pc, worker } = await installed((pc) => pc.pages.set("/plan", "<html><head></head><body>plan</body></html>"));
      await fire(worker, "fetch", navigate("/plan")).settled();
      pc.silent = true;
      fire(worker, "message", { data: { type: "pc-gone" } });

      const first = fire(worker, "fetch", navigate("/plan")).responded!;
      let shown = false;
      void first.then(() => (shown = true));
      await vi.advanceTimersByTimeAsync(799);
      expect(shown).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await text(await first)).toContain("plan");

      // told the PC is back: the full wait again (it may be slow to answer, but it is there)
      fire(worker, "message", { data: { type: "pc-back" } });
      const second = fire(worker, "fetch", navigate("/plan")).responded!;
      let shownAgain = false;
      void second.then(() => (shownAgain = true));
      await vi.advanceTimersByTimeAsync(3_999);
      expect(shownAgain).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(shownAgain).toBe(true);
    });

    it("forgets that the PC was gone after a minute, in case it never hears it is back", async () => {
      vi.useFakeTimers({ now: 1_000_000 });
      const { pc, worker } = await installed((pc) => pc.pages.set("/plan", "<html><head></head><body>plan</body></html>"));
      await fire(worker, "fetch", navigate("/plan")).settled();
      pc.silent = true;
      fire(worker, "message", { data: { type: "pc-gone" } });
      await vi.advanceTimersByTimeAsync(60_001);
      const responded = fire(worker, "fetch", navigate("/plan")).responded!;
      let shown = false;
      void responded.then(() => (shown = true));
      await vi.advanceTimersByTimeAsync(3_000);
      expect(shown).toBe(false); // back to waiting the full four seconds
      await vi.advanceTimersByTimeAsync(1_000);
      expect(shown).toBe(true);
    });

    it("a page never opened shows the offline page, and with no offline page either, the browser's own error", async () => {
      const { pc, worker } = await installed();
      pc.up = false;
      expect(await text(await fire(worker, "fetch", navigate("/insights")).responded)).toContain("offline");
      worker.stores.get(worker.names().find((n) => n.includes("shell"))!)!.clear();
      expect(((await fire(worker, "fetch", navigate("/insights")).responded) as Response).type).toBe("error");
    });

    it("keeps each address separately: another month is not the copy of this one", async () => {
      const { pc, worker } = await installed((pc) => {
        pc.pages.set("/dashboard", "<html><head></head><body>this month</body></html>");
        pc.pages.set("/dashboard?month=2026-09", "<html><head></head><body>september</body></html>");
      });
      await fire(worker, "fetch", navigate("/dashboard")).settled();
      pc.up = false;
      expect(await text(await fire(worker, "fetch", navigate("/dashboard")).responded)).toContain("this month");
      expect(await text(await fire(worker, "fetch", navigate("/dashboard?month=2026-09")).responded)).not.toContain("september");
    });

    it("keeps the newest forty pages and lets the oldest go", async () => {
      const { worker } = await installed((pc) => {
        for (let i = 0; i < 45; i++) pc.pages.set(`/p${i}`, `<html><head></head><body>${i}</body></html>`);
      });
      for (let i = 0; i < 45; i++) await fire(worker, "fetch", navigate(`/p${i}`)).settled();
      const kept = [...worker.cache("money-tracker-pages")!.keys()];
      expect(kept).toHaveLength(40);
      expect(kept).not.toContain(`${ORIGIN}/p0`);
      expect(kept).toContain(`${ORIGIN}/p44`);
    });
  });

  describe("scripts, styles and icons", () => {
    it("keeps a script for good, and never asks for it twice", async () => {
      const { pc, worker } = await installed((pc) => pc.assets.add("/_next/static/chunks/abc.js"));
      const first = fire(worker, "fetch", subrequest("/_next/static/chunks/abc.js"));
      await first.responded;
      await first.settled();
      pc.asked.length = 0;
      await fire(worker, "fetch", subrequest("/_next/static/chunks/abc.js")).responded;
      expect(pc.asked).toEqual([]);
      pc.up = false;
      expect(await text(await fire(worker, "fetch", subrequest("/_next/static/chunks/abc.js")).responded)).toBe("code");
    });

    it("lets a script it never kept fail like any other request when the PC is gone", async () => {
      const { pc, worker } = await installed();
      pc.up = false;
      await expect(fire(worker, "fetch", subrequest("/_next/static/chunks/nope.js")).responded).rejects.toThrow();
    });

    it("an icon falls back to its saved copy when only the proxy answers", async () => {
      const { pc, worker } = await installed((pc) => pc.assets.add("/pwa/icon-192.png"));
      const first = fire(worker, "fetch", subrequest("/pwa/icon-192.png"));
      await first.responded;
      await first.settled();
      pc.custom.set("/pwa/icon-192.png", () => new Response("Bad Gateway", { status: 502 }));
      expect(await text(await fire(worker, "fetch", subrequest("/pwa/icon-192.png")).responded)).toBe("code");
    });

    it("icons and the manifest come fresh from the PC when it is there, and from the copy when it isn't", async () => {
      const { pc, worker } = await installed((pc) => pc.assets.add("/pwa/icon-192.png"));
      const first = fire(worker, "fetch", subrequest("/pwa/icon-192.png"));
      await first.responded;
      await first.settled();
      pc.up = false;
      expect(await text(await fire(worker, "fetch", subrequest("/pwa/icon-192.png")).responded)).toBe("code");
    });
  });

  describe("everything else is not its business", () => {
    it("a save, the sync, the ping, a lookup, a page's data, another site: untouched", async () => {
      const { worker } = await installed();
      const untouched = [
        { request: { method: "POST", mode: "cors", url: `${ORIGIN}/sync/entries` } },
        { request: { method: "POST", mode: "same-origin", url: `${ORIGIN}/` } },
        // a plain form submission is a POST that navigates: answering it with a saved page would pretend it was sent
        { request: { method: "POST", mode: "navigate", url: `${ORIGIN}/login` } },
        subrequest("/sync/entries"),
        subrequest("/ping", { mode: "cors" }),
        subrequest("/transactions/lookalikes?type=expense"),
        subrequest("/dashboard?_rsc=abc", { headers: { rsc: "1" } }),
        { request: { method: "GET", mode: "cors", url: "https://elsewhere.test/script.js" } },
      ];
      for (const e of untouched) expect(fire(worker, "fetch", e).responded, e.request.url).toBeUndefined();
    });
  });

  describe("keeping every tab for offline (the app asks after each visit)", () => {
    const page = (scripts: string[], extra = "") => `<html><head></head><body>${scripts.map((s) => `<script src="${s}"></script>`).join("")}${extra}</body></html>`;

    it("fetches each page, keeps it, and keeps the scripts it names, in either spelling", async () => {
      const { pc, worker } = await installed((pc) => {
        pc.pages.set("/", page(["/_next/static/chunks/a.js"], `<script>self.__next_f.push(["static/chunks/b.js","static/css/c.css","static/media/f-s.p.woff2"])</script>`));
        pc.pages.set("/plan", page(["/_next/static/chunks/a.js", "/_next/static/chunks/d.js"]));
        for (const a of ["a.js", "b.js", "d.js"]) pc.assets.add(`/_next/static/chunks/${a}`);
        pc.assets.add("/_next/static/css/c.css");
        pc.assets.add("/_next/static/media/f-s.p.woff2");
      });
      pc.asked.length = 0;
      const event = fire(worker, "message", { data: { type: "save-pages", urls: ["/", "/plan"] } });
      await event.settled();
      expect([...worker.cache("money-tracker-pages")!.keys()].sort()).toEqual([`${ORIGIN}/`, `${ORIGIN}/plan`]);
      expect([...worker.cache("money-tracker-static")!.keys()].sort()).toEqual(
        ["a.js", "b.js", "d.js"].map((f) => `${ORIGIN}/_next/static/chunks/${f}`).concat(`${ORIGIN}/_next/static/css/c.css`, `${ORIGIN}/_next/static/media/f-s.p.woff2`).sort(),
      );
      expect(pc.asked.filter((p) => p === "/_next/static/chunks/a.js")).toHaveLength(1); // named by two pages, fetched once
    });

    it("works offline afterwards: the saved tab opens and its scripts load", async () => {
      const { pc, worker } = await installed((pc) => {
        pc.pages.set("/invest", page(["/_next/static/chunks/inv.js"]));
        pc.assets.add("/_next/static/chunks/inv.js");
      });
      await fire(worker, "message", { data: { type: "save-pages", urls: ["/invest"] } }).settled();
      pc.up = false;
      expect(await text(await fire(worker, "fetch", navigate("/invest")).responded)).toContain("inv.js");
      expect(await text(await fire(worker, "fetch", subrequest("/_next/static/chunks/inv.js")).responded)).toBe("code");
    });

    it("only fetches paths on this site, and nothing that isn't a path", async () => {
      const { pc, worker } = await installed();
      pc.asked.length = 0;
      await fire(worker, "message", { data: { type: "save-pages", urls: ["//evil.test/x", "https://evil.test/", "dashboard", 42, null] } }).settled();
      expect(pc.asked).toEqual([]);
    });

    it("stops at the first silence rather than trying every page against a PC that isn't there", async () => {
      const { pc, worker } = await installed((pc) => pc.pages.set("/", page([])));
      pc.up = false;
      pc.asked.length = 0;
      await fire(worker, "message", { data: { type: "save-pages", urls: ["/", "/plan", "/dashboard"] } }).settled();
      expect(pc.asked).toEqual(["/"]);
    });

    it("stops at a proxy's 'bad gateway' too: the app isn't running, so nothing more can be saved now", async () => {
      const { pc, worker } = await installed((pc) => {
        pc.pages.set("/", page([]));
        pc.pages.set("/plan", page([]));
        pc.custom.set("/", () => new Response("Bad Gateway", { status: 502 }));
      });
      pc.asked.length = 0;
      await fire(worker, "message", { data: { type: "save-pages", urls: ["/", "/plan", "/dashboard"] } }).settled();
      expect(pc.asked).toEqual(["/"]);
    });

    it("skips what turns out to be the login page (the session ran out)", async () => {
      const { worker } = await installed((pc) => pc.custom.set("/plan", () => Object.defineProperty(html("<html>PIN</html>"), "redirected", { value: true })));
      await fire(worker, "message", { data: { type: "save-pages", urls: ["/plan"] } }).settled();
      expect(worker.cache("money-tracker-pages")?.size ?? 0).toBe(0);
    });

    it("names at most eighty scripts per page", async () => {
      const many = Array.from({ length: 120 }, (_, i) => `/_next/static/chunks/c${i}.js`);
      const { pc, worker } = await installed((pc) => {
        pc.pages.set("/", page(many));
        for (const m of many) pc.assets.add(m);
      });
      await fire(worker, "message", { data: { type: "save-pages", urls: ["/"] } }).settled();
      expect(worker.cache("money-tracker-static")!.size).toBe(80);
      expect(pc.asked.filter((p) => p.startsWith("/_next/")).length).toBe(80);
    });
  });

  describe("locking the app", () => {
    it("forgets every saved page, and only the pages", async () => {
      const { worker } = await installed((pc) => {
        pc.pages.set("/", "<html><head></head><body>private</body></html>");
        pc.assets.add("/_next/static/chunks/a.js");
      });
      await fire(worker, "fetch", navigate("/")).settled();
      const asset = fire(worker, "fetch", subrequest("/_next/static/chunks/a.js"));
      await asset.responded;
      await asset.settled();
      await fire(worker, "message", { data: { type: "forget-pages" } }).settled();
      expect(worker.names().some((n) => n.includes("pages"))).toBe(false);
      expect(worker.cache("money-tracker-static")!.size).toBe(1);
      expect(worker.cache("money-tracker-shell")!.size).toBe(1);
    });
  });
});
