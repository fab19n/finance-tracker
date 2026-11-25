import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import manifest from "@/app/manifest";
import { ADD_SHORTCUT_URL, LAUNCH_SCRIPT } from "@/lib/launch";

/** Run the real inline script against a pretend browser, and say where it sent the page. */
function open(address: string, opts: { history?: number; standalone?: boolean; iosStandalone?: boolean; noMatchMedia?: boolean } = {}) {
  const url = new URL(address, "https://app.test");
  const replace = vi.fn();
  const style = { visibility: "" };
  const timers: { run: () => void; ms: number }[] = [];
  runInNewContext(LAUNCH_SCRIPT, {
    location: { pathname: url.pathname, search: url.search, hash: url.hash, replace },
    history: { length: opts.history ?? 1 },
    navigator: { standalone: opts.iosStandalone },
    matchMedia: opts.noMatchMedia ? undefined : (q: string) => ({ matches: q === "(display-mode: standalone)" && (opts.standalone ?? true) }),
    document: { documentElement: { style } },
    setTimeout: (run: () => void, ms: number) => timers.push({ run, ms }),
  });
  return { sentTo: replace.mock.calls[0]?.[0] as string | undefined, style, timers };
}

describe("opening the installed app", () => {
  it("goes from a bare / to Home, hiding the Add page while Home loads", () => {
    const { sentTo, style, timers } = open("/");
    expect(sentTo).toBe("/dashboard");
    expect(style.visibility).toBe("hidden");
    // If Home never arrives, the page comes back rather than staying blank.
    timers[0].run();
    expect(style.visibility).toBe("");
  });

  it("works for an app added to an iPhone's home screen too", () => {
    expect(open("/", { standalone: false, iosStandalone: true }).sentTo).toBe("/dashboard");
  });

  it("leaves Add alone once you are already in the app (the + button, Back, a reload)", () => {
    const { sentTo, style } = open("/", { history: 2 });
    expect(sentTo).toBeUndefined();
    expect(style.visibility).toBe("");
  });

  it.each(["/?copy=12", "/?account=3", "/#waiting", ADD_SHORTCUT_URL])("opens Add when the address asks for it (%s)", (address) => {
    expect(open(address).sentTo).toBeUndefined();
  });

  it.each(["/dashboard", "/transactions", "/login"])("leaves other pages alone (%s)", (address) => {
    expect(open(address).sentTo).toBeUndefined();
  });

  it("leaves an ordinary browser tab alone, and a browser it cannot ask", () => {
    expect(open("/", { standalone: false }).sentTo).toBeUndefined();
    expect(open("/", { noMatchMedia: true }).sentTo).toBeUndefined();
  });

  it("starts a new install on Home, and the Add shortcut still opens Add", () => {
    const m = manifest();
    expect(m.start_url).toBe("/dashboard");
    expect(m.shortcuts?.find((s) => s.name === "Add entry")?.url).toBe(ADD_SHORTCUT_URL);
    expect(open(ADD_SHORTCUT_URL).sentTo).toBeUndefined();
  });
});
