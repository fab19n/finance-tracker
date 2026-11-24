#!/usr/bin/env node
// Browser checks against an ALREADY RUNNING app. It never starts or builds anything.
//   pnpm run e2e -- --base http://127.0.0.1:3210 [--browser <path>] [--pages plan,/settings] [--warn-only]
// See "Browser checks" in README.md for how to start a throwaway app to point it at.
import { findBrowser, launch, openTab, setLook, sleep } from "./cdp.mjs";
import { blurActive, collectPage, focusSnapshot, isHydrated } from "./page-scripts.mjs";
import {
  MIN_TARGET_PX,
  THEMES,
  VIEWPORTS,
  accessibleName,
  duplicateIds,
  evaluateContrast,
  exitCode,
  focusRingVisible,
  hasOutline,
  isGenericTitle,
  isRealConsoleError,
  normaliseBase,
  parseArgs,
  parsePages,
  redirectsToLogin,
  renderReport,
  toFailures,
  truncate,
} from "./lib.mjs";

const USAGE = `Usage: pnpm run e2e -- --base http://127.0.0.1:3210 [--browser <path>] [--pages a,b] [--warn-only]`;

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    process.exit(0);
  }
  opts.base = normaliseBase(opts.base);
  opts.list = parsePages(opts.pages);
} catch (e) {
  console.error(`${e.message}\n${USAGE}`);
  process.exit(2);
}

const failures = [];
let checks = 0;
const record = (ctx, check, details) => {
  checks++;
  failures.push(...toFailures(ctx, check, details));
};

async function checkPage(tab, path, viewport, theme) {
  const ctx = { page: path, viewport: viewport.name, theme };
  tab.errors.length = 0;
  try {
    await tab.goto(opts.base + path);
  } catch (e) {
    record(ctx, "load", [`navigation failed: ${e.message}`]);
    return;
  }
  const finalPath = await tab.evaluate(() => location.pathname);
  if (finalPath === "/login" && !path.startsWith("/login")) {
    record(ctx, "load", ["redirected to /login: start the app with an empty APP_PIN for these checks"]);
    return;
  }
  if (!(await tab.waitFor(isHydrated, 15000))) record(ctx, "hydration", ["the page did not hydrate within 15 s"]);
  await sleep(500);

  const data = await tab.evaluate(collectPage);

  record(ctx, "console", tab.errors.filter((e) => e.kind === "exception" || isRealConsoleError(e)).map((e) => truncate(`${e.kind}: ${e.text}`, 200)));
  record(ctx, "title", isGenericTitle(data.title) ? [`document.title is "${data.title}"`] : []);
  record(ctx, "h1", data.h1Count === 1 ? [] : [`${data.h1Count} h1 elements (want exactly 1)`]);
  record(ctx, "names", data.named.filter((n) => !accessibleName(n.d)).map((n) => `${n.sel} has no accessible name`));
  record(ctx, "ids", duplicateIds(data.ids).map((id) => `duplicate id "${id}"`));
  if (viewport.width <= 400) {
    record(ctx, "overflow", data.scrollWidth > data.clientWidth ? [`page scrolls sideways: scrollWidth ${data.scrollWidth} > ${data.clientWidth}`] : []);
  }
  record(
    ctx,
    "target-size",
    data.targets.filter((t) => t.h < MIN_TARGET_PX).map((t) => `${t.sel} "${truncate(t.text, 30)}" is ${t.h} px high`),
  );
  record(
    ctx,
    "contrast",
    data.samples
      .map((s) => ({ s, r: evaluateContrast(s) }))
      .filter(({ r }) => r && !r.ok)
      .map(({ s, r }) => `${s.sel} "${truncate(s.text, 30)}" ${r.ratio.toFixed(2)}:1 (need ${r.required})`),
  );

  // Focus ring on the first five Tab stops.
  const ringProblems = [];
  await tab.evaluate(() => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  for (let i = 0; i < 5; i++) {
    await tab.key("Tab", "Tab", 9);
    await sleep(60);
    const now = await tab.evaluate(focusSnapshot);
    if (!now || !now.visible) continue;
    const before = await tab.evaluate(blurActive);
    if (!before) continue;
    const okSelf = focusRingVisible(before.self, now.now);
    const okParent = focusRingVisible(before.parent, now.nowParent);
    // An element that always shows an outline (the current page in the sidebar) has a ring whether or not it is focused.
    if (!okSelf && !okParent && !hasOutline(before.self)) ringProblems.push(`Tab stop ${i + 1}: ${now.sel} "${truncate(now.text, 24)}" shows no focus ring`);
  }
  record(ctx, "focus-ring", ringProblems);
}

async function scenarioBackLinks(tab) {
  const ctx = { page: "scenario", viewport: "mobile", theme: "light" };
  const here = () => tab.evaluate(() => location.pathname + location.search);
  const clickHref = (href) =>
    tab.evaluate((h) => {
      const a = Array.from(document.querySelectorAll("a[href]")).find((x) => x.getAttribute("href") === h || x.getAttribute("href")?.startsWith(h + "?"));
      if (!a) return false;
      a.click();
      return true;
    }, href);
  const clickBack = () =>
    tab.evaluate(() => {
      const a = Array.from(document.querySelectorAll("a[href]")).find((x) => /^\s*back\b/i.test(x.getAttribute("aria-label") || x.textContent || "") || /back to/i.test(x.getAttribute("aria-label") || x.textContent || ""));
      if (!a) return false;
      a.click();
      return true;
    });
  const wait = async (pred) => tab.waitFor(pred, 8000);
  try {
    await setLook(tab, VIEWPORTS[0], "light");
    await tab.goto(opts.base + "/more");
    await tab.waitFor(isHydrated, 15000);
    if (!(await clickHref("/plan"))) return record(ctx, "back-links", ["/more has no link to /plan"]);
    await wait(() => location.pathname === "/plan");
    await sleep(500); // the tracker records each page after it paints: a person never taps faster than that
    // Import is reached through More, which stays lit on the pages behind it.
    if (!(await clickHref("/import"))) {
      await clickHref("/more");
      await wait(() => location.pathname === "/more");
      await sleep(500);
      if (!(await clickHref("/import"))) return record(ctx, "back-links", ["no way to reach /import from /plan or /more"]);
    }
    await wait(() => location.pathname === "/import");
    const seen = [];
    for (let i = 0; i < 2; i++) {
      if (!(await clickBack())) break;
      await sleep(900);
      seen.push(await here());
      if (seen[seen.length - 1].startsWith("/more")) break;
    }
    const reached = seen.some((p) => p.startsWith("/more"));
    record(ctx, "back-links", reached ? [] : [`More > Plan > Import > Back > Back ended on ${seen.join(" then ") || "the import page (no back link)"}, not /more`]);
  } catch (e) {
    record(ctx, "back-links", [`scenario failed: ${e.message}`]);
  }
}

async function scenarioSwipe(tab) {
  const ctx = { page: "scenario", viewport: "mobile", theme: "light" };
  try {
    await setLook(tab, VIEWPORTS[0], "light");
    await tab.goto(opts.base + "/plan");
    await tab.waitFor(isHydrated, 15000);
    await sleep(500);
    // A phone page only hears touch events once touch emulation is on (the swipe is a touch gesture, not a mouse drag).
    await tab.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    const touch = (type, x, y) => tab.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    const y = 520;
    await touch("touchStart", 330, y);
    for (const x of [300, 260, 220, 180, 140, 100]) await touch("touchMove", x, y);
    await touch("touchEnd", 100, y);
    const moved = await tab.waitFor(() => location.pathname === "/plan/bills", 6000);
    const at = await tab.evaluate(() => location.pathname);
    record(ctx, "swipe", moved ? [] : [`a left swipe on /plan left the page at ${at}, not /plan/bills`]);
  } catch (e) {
    record(ctx, "swipe", [`scenario failed: ${e.message}`]);
  }
}

async function scenarioForgedCookie() {
  const ctx = { page: "scenario", viewport: "", theme: "" };
  try {
    const plain = await fetch(opts.base + "/dashboard", { redirect: "manual" });
    if (!redirectsToLogin(plain.status, plain.headers.get("location"), opts.base)) {
      console.log("skipped: forged-cookie check (the app has no PIN: APP_PIN is empty)");
      return;
    }
    const forged = await fetch(opts.base + "/dashboard", { redirect: "manual", headers: { cookie: "mt_auth=forged.1999999999999.deadbeef" } });
    const ok = redirectsToLogin(forged.status, forged.headers.get("location"), opts.base);
    record(ctx, "forged-cookie", ok ? [] : [`a forged mt_auth cookie got status ${forged.status} instead of a redirect to /login`]);
  } catch (e) {
    record(ctx, "forged-cookie", [`scenario failed: ${e.message}`]);
  }
}

async function main() {
  try {
    const r = await fetch(opts.base + "/ping", { redirect: "manual" });
    if (r.status >= 500) throw new Error(`status ${r.status}`);
  } catch (e) {
    console.error(`Cannot reach ${opts.base} (${e.message}). Start the app first; see "Browser checks" in README.md.`);
    process.exit(2);
  }

  const browserPath = findBrowser(opts.browser);
  console.log(`Browser: ${browserPath}\nApp: ${opts.base}\nPages: ${opts.list.length} x ${VIEWPORTS.length} sizes x ${THEMES.length} themes`);
  const { cdp, close } = await launch(browserPath);
  try {
    const tab = await openTab(cdp);
    for (const vp of VIEWPORTS) {
      for (const theme of THEMES) {
        await setLook(tab, vp, theme);
        for (const path of opts.list) {
          process.stdout.write(`  ${vp.name} ${theme} ${path}\n`);
          await checkPage(tab, path, vp, theme);
        }
      }
    }
    await scenarioBackLinks(tab);
    await scenarioSwipe(tab);
    await tab.close();
  } finally {
    await close();
  }
  await scenarioForgedCookie();

  console.log("\n" + renderReport(failures, checks));
  const code = exitCode(failures, opts.warnOnly);
  if (failures.length && opts.warnOnly) console.log("(--warn-only: exiting 0)");
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
