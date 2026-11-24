// A small DevTools-protocol client over Node's built-in WebSocket and fetch (no packages), and the browser launcher.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PATH_BROWSER_NAMES, browserCandidates, pickBrowser } from "./lib.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

/** Look for the browser: an explicit path, installed Edge/Chrome, then PATH. */
export function findBrowser(explicit) {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`Browser not found at ${explicit}`);
    return explicit;
  }
  const installed = pickBrowser(browserCandidates(process.env, process.platform), existsSync);
  if (installed) return installed;
  const dirs = (process.env.PATH || "").split(process.platform === "win32" ? ";" : ":").filter(Boolean);
  const exts = process.platform === "win32" ? [".exe", ".cmd", ""] : [""];
  const onPath = [];
  for (const name of PATH_BROWSER_NAMES) for (const d of dirs) for (const e of exts) onPath.push(join(d, name + e));
  const found = pickBrowser(onPath, existsSync);
  if (!found) throw new Error("No Edge or Chrome found. Pass --browser <path to msedge.exe or chrome.exe>.");
  return found;
}

export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const l of this.listeners) l(msg);
      }
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", () => rej(new Error("DevTools socket failed")), { once: true });
    });
    return new Cdp(ws);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 30000);
      this.pending.set(id, {
        resolve: (v) => (clearTimeout(t), resolve(v)),
        reject: (e) => (clearTimeout(t), reject(e)),
      });
      this.ws.send(JSON.stringify(payload));
    });
  }
  on(fn) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }
  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

/** Start the browser headless with a throwaway profile. Returns {cdp, close}. */
export async function launch(browserPath) {
  const profile = mkdtempSync(join(tmpdir(), "koopang-e2e-"));
  const child = spawn(
    browserPath,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-sync",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  let exited = false;
  child.on("exit", () => (exited = true));
  const portFile = join(profile, "DevToolsActivePort");
  let port = null;
  for (let i = 0; i < 100 && !port; i++) {
    if (exited) break;
    if (existsSync(portFile)) {
      const first = readFileSync(portFile, "utf8").split(/\r?\n/)[0];
      if (first) port = Number(first);
    }
    if (!port) await sleep(150);
  }
  const cleanup = async () => {
    try {
      child.kill();
    } catch {}
    await sleep(400);
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await sleep(500);
      }
    }
  };
  if (!port) {
    await cleanup();
    throw new Error("The browser did not report a DevTools port.");
  }
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const cdp = await Cdp.connect(version.webSocketDebuggerUrl);
  return {
    cdp,
    close: async () => {
      cdp.close();
      await cleanup();
    },
  };
}

/** One tab, attached with a session; helpers for navigating and evaluating. */
export async function openTab(cdp) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (m, p) => cdp.send(m, p, sessionId);
  const errors = [];
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      errors.push({ kind: "exception", text: d.exception?.description || d.text });
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      errors.push({ kind: "console", level: "error", text: msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ") });
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      const e = msg.params.entry;
      errors.push({ kind: "console", level: "error", text: e.text, url: e.url });
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  const evaluate = async (fn, ...args) => {
    const expression = typeof fn === "function" ? `(${fn.toString()})(...${JSON.stringify(args)})` : fn;
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (fn, ms = 10000, ...args) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try {
        if (await evaluate(fn, ...args)) return true;
      } catch {}
      await sleep(120);
    }
    return false;
  };
  const goto = async (url) => {
    await send("Page.navigate", { url });
    await sleep(150);
    await waitFor(() => document.readyState === "complete", 20000);
  };
  const key = async (k, code, vk) => {
    for (const type of ["rawKeyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", { type, key: k, code, windowsVirtualKeyCode: vk });
    }
  };
  return { send, evaluate, waitFor, goto, key, errors, close: () => cdp.send("Target.closeTarget", { targetId }) };
}

export async function setLook(tab, viewport, theme) {
  await tab.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  // Chrome rejects maxTouchPoints: 0, so a desktop page just turns touch emulation off.
  await tab.send("Emulation.setTouchEmulationEnabled", viewport.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await tab.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "reduce" }] });
}
