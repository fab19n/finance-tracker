/*
 * Koopang's service worker. Its job is to keep the app usable when your PC can't be reached (asleep, off, or
 * Tailscale not connected on this phone).
 *
 *  - PAGES: every page you open is kept as it was last seen. When the PC doesn't answer, the phone shows that copy, marked
 *    with when it was saved so the app can say so (window.__MT_SAVED_AT). A page you have never opened shows /offline.html.
 *  - SCRIPTS and styles under /_next/static are named after their contents, so a copy is good for ever and is kept.
 *  - NOTHING ELSE is touched: saving an entry, sending the outbox, looking something up. Those go to the PC or fail loudly.
 *    Entries typed while the PC is gone are kept by the app itself, in its own storage (src/lib/offline), never here.
 *
 * Changed offline.html, or these caching rules? Bump VERSION, so every phone starts afresh.
 */
const VERSION = "v4";
const SHELL = `money-tracker-shell-${VERSION}`;
const PAGES = `money-tracker-pages-${VERSION}`;
const STATIC = `money-tracker-static-${VERSION}`;
const CURRENT = [SHELL, PAGES, STATIC];

const OFFLINE_URL = "/offline.html";
const SAVED_AT = "x-saved-at";
// A PC that is asleep doesn't refuse the connection, it just never answers: don't stare at a blank screen for long.
const WAIT_FOR_PC_MS = 4000;
// Once the app has found the PC gone it says so (see "pc-gone" below), and a tap on a tab then waits only this long for it:
// enough for a PC that has just woken, short enough that browsing the saved pages feels instant.
const WAIT_FOR_GONE_PC_MS = 800;
const PC_GONE_FOR_MS = 60_000;
let pcGoneUntil = 0;
const MAX_PAGES = 40;
const MAX_STATIC = 600;
const MAX_ASSETS_PER_PAGE = 80;
// Scripts are named in the page two ways: "/_next/static/chunks/x.js" in tags, "static/chunks/x.js" in the embedded data.
const ASSET = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[A-Za-z0-9_.~%-]+\.(?:js|css|woff2?)/g;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !CURRENT.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(openPage(event, request, url));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(keptForGood(event, request));
  } else if (url.pathname.startsWith("/pwa/") || url.pathname === "/manifest.webmanifest" || url.pathname === "/favicon.ico") {
    event.respondWith(freshOrKept(event, request));
  }
  // Anything else (a page's data, a lookup, the sync, the ping) is not ours: it goes to the PC or fails.
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "save-pages" && Array.isArray(data.urls)) event.waitUntil(savePages(data.urls));
  else if (data.type === "forget-pages") event.waitUntil(caches.delete(PAGES));
  // The app's own checks tell us how things stand. If we never hear (the worker restarts), we just wait the full time.
  else if (data.type === "pc-gone") pcGoneUntil = Date.now() + PC_GONE_FOR_MS;
  else if (data.type === "pc-back") pcGoneUntil = 0;
});

// ---- pages ---------------------------------------------------------------------------------------------------------

async function openPage(event, request, url) {
  const key = pageKey(url);
  try {
    const response = await within(Date.now() < pcGoneUntil ? WAIT_FOR_GONE_PC_MS : WAIT_FOR_PC_MS, fetch(request));
    if (gatewayFailure(response)) throw new Error("the app isn't running behind its proxy");
    if (worthKeeping(response, url)) event.waitUntil(keepPage(key, response.clone()));
    return response;
  } catch {
    // The PC isn't answering. Show the last copy, or say there isn't one.
    return (await keptPage(key)) || (await offlinePage());
  }
}

/**
 * A proxy in front of the app (tailscale serve) answers 502/503/504 when the APP isn't running, which is what you get after
 * the PC restarts and nothing has started it yet. That is "can't reach the PC", not an answer: the app never says these.
 */
const gatewayFailure = (response) => response.status === 502 || response.status === 503 || response.status === 504;

/** A real answer from this app: not opaque, not a redirect to somewhere else, not an error. ("default" is what code makes.) */
const ours = (response) => response.ok && !response.redirected && (response.type === "basic" || response.type === "default");

/** Only a real page of the app, and not the login page. */
function worthKeeping(response, url) {
  return ours(response) && (response.headers.get("content-type") || "").includes("text/html") && !url.pathname.startsWith("/login");
}

const pageKey = (url) => url.pathname + url.search;
const absolute = (key) => new URL(key, self.location.origin).href;

async function keepPage(key, response) {
  // Remember when this copy was taken. (The body was decoded on its way in, so the encoding headers must not travel with it.)
  const headers = plainHeaders(response.headers);
  headers.set(SAVED_AT, String(Date.now()));
  const cache = await caches.open(PAGES);
  await cache.put(absolute(key), new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
  await tidy(cache, MAX_PAGES);
}

async function keptPage(key) {
  const cache = await caches.open(PAGES);
  const copy = await cache.match(absolute(key), { ignoreVary: true });
  if (!copy) return undefined;
  // Tell the page it is a copy, and from when, so the app can say so (and refresh itself when the PC comes back).
  const savedAt = Number(copy.headers.get(SAVED_AT)) || 0;
  const html = await copy.text();
  const marker = `<script>window.__MT_SAVED_AT=${savedAt};</script>`;
  const headers = plainHeaders(copy.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(html.includes("</head>") ? html.replace("</head>", () => `${marker}</head>`) : marker + html, { status: 200, headers });
}

async function offlinePage() {
  return (await caches.match(OFFLINE_URL)) || Response.error();
}

function plainHeaders(source) {
  const headers = new Headers(source);
  for (const name of ["content-encoding", "content-length", "transfer-encoding"]) headers.delete(name);
  return headers;
}

// ---- scripts, styles, icons ----------------------------------------------------------------------------------------

async function keptForGood(event, request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (ours(response)) event.waitUntil(cache.put(request, response.clone()).then(() => tidy(cache, MAX_STATIC)));
  return response;
}

async function freshOrKept(event, request) {
  const cache = await caches.open(STATIC);
  try {
    const response = await within(WAIT_FOR_PC_MS, fetch(request));
    if (gatewayFailure(response)) throw new Error("the app isn't running behind its proxy");
    if (ours(response)) event.waitUntil(cache.put(request, response.clone()));
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

// ---- keeping every tab for offline ---------------------------------------------------------------------------------

/** Fetch each page now, and the scripts it needs, so every tab opens later without the PC. Stops at the first silence. */
async function savePages(paths) {
  for (const path of paths) {
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) continue;
    const url = new URL(path, self.location.origin);
    let response;
    try {
      response = await within(15000, fetch(url.href, { credentials: "same-origin" }));
    } catch {
      return; // the PC isn't answering: nothing more to do now
    }
    if (gatewayFailure(response)) return; // its proxy is up but the app isn't: the same
    if (!worthKeeping(response, url)) continue;
    const html = await response.clone().text();
    await keepPage(pageKey(url), response);
    await keepScriptsFor(html);
  }
}

async function keepScriptsFor(html) {
  const found = new Set();
  for (const match of html.matchAll(ASSET)) {
    found.add(match[0].startsWith("/_next/") ? match[0] : `/_next/${match[0]}`);
    if (found.size >= MAX_ASSETS_PER_PAGE) break;
  }
  const cache = await caches.open(STATIC);
  for (const path of found) {
    if (await cache.match(path)) continue;
    try {
      const response = await fetch(path);
      if (response.ok) await cache.put(path, response);
    } catch {
      return;
    }
  }
  await tidy(cache, MAX_STATIC);
}

// ---- small helpers -------------------------------------------------------------------------------------------------

/** Reject if `promise` hasn't answered in `ms`. */
function within(ms, promise) {
  let timer;
  const silence = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("no answer")), ms);
  });
  return Promise.race([promise, silence]).finally(() => clearTimeout(timer));
}

/** Keep the newest `max` entries (a cache lists them oldest first). */
async function tidy(cache, max) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}
