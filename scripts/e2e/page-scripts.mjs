// Functions that run INSIDE the page (they are stringified and sent over the DevTools protocol), so each must be
// self-contained: no imports, no references to anything outside its own body. They only gather facts; the judging
// happens in lib.mjs, where it can be unit-tested.

export function collectPage() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
      if (n.hasAttribute("inert") || n.getAttribute("aria-hidden") === "true") {
        // aria-hidden content is not read by assistive tech; still checked for size, but not for names
      }
    }
    return true;
  };
  const selector = (el) => {
    if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      const cls = (n.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) s += "." + cls.join(".");
      parts.unshift(s);
      if (n.id) break;
    }
    return parts.join(" > ");
  };
  const text = (el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
  const idText = (ids) =>
    (ids || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((e) => e.textContent || "");

  const out = {};
  out.title = document.title;
  out.h1Count = document.querySelectorAll("h1").length;
  out.ids = Array.from(document.querySelectorAll("[id]")).map((e) => e.id);
  out.scrollWidth = document.documentElement.scrollWidth;
  out.clientWidth = document.documentElement.clientWidth;

  // Names of buttons and links.
  out.nameless = [];
  out.named = [];
  for (const el of document.querySelectorAll("a[href], button, [role=button], [role=link], input:not([type=hidden]), select, textarea, summary")) {
    if (!visible(el)) continue;
    const tag = el.tagName.toLowerCase();
    const labels = el.labels ? Array.from(el.labels).map((l) => l.textContent || "") : [];
    const img = el.querySelector("img[alt], svg[aria-label], [role=img][aria-label]");
    out.named.push({
      sel: selector(el),
      d: {
        tag,
        type: el.getAttribute("type") || "",
        ariaLabel: el.getAttribute("aria-label") || (img ? img.getAttribute("alt") || img.getAttribute("aria-label") : "") || "",
        labelledBy: idText(el.getAttribute("aria-labelledby")),
        labels,
        text: el.innerText || el.textContent || "",
        title: el.getAttribute("title") || "",
        alt: el.getAttribute("alt") || "",
        placeholder: el.getAttribute("placeholder") || "",
        value: el.value || "",
      },
    });
  }

  // Touch targets.
  out.targets = [];
  for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, summary, [role=radio], [role=switch]")) {
    if (!visible(el)) continue;
    // The skip link is hidden until focused, and a link inside a sentence is exempt from the size rule (WCAG 2.5.8).
    if (el.classList.contains("sr-only")) continue;
    if (el.tagName === "A" && el.parentElement && el.closest("p, li") && el.parentElement.textContent.length - el.textContent.length > 12 && getComputedStyle(el).display === "inline") continue;
    const r = el.getBoundingClientRect();
    // A native radio or checkbox inside a label is operated through the label: measure the label then.
    let box = r;
    if ((el.type === "radio" || el.type === "checkbox") && el.labels && el.labels[0]) box = el.labels[0].getBoundingClientRect();
    if (r.width * r.height < 4 && !(el.labels && el.labels[0])) continue; // visually hidden helper inputs
    out.targets.push({ sel: selector(el), text: text(el) || el.getAttribute("aria-label") || el.getAttribute("name") || "", h: Math.round(box.height * 10) / 10, w: Math.round(box.width * 10) / 10 });
  }

  // Text colour samples.
  out.samples = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let node;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue || !node.nodeValue.trim()) continue;
    const el = node.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"].includes(el.tagName)) continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color && cs.webkitTextFillColor.startsWith("rgba(0, 0, 0, 0)")) continue;
    const layers = [];
    let skip = false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none") { skip = true; break; }
      if (Number(s.opacity) < 1) { skip = true; break; }
      layers.push(s.backgroundColor);
      const c = s.backgroundColor.replace(/\s/g, "");
      if (/^rgb\(/.test(c) || /,1\)$/.test(c)) break; // opaque: nothing behind it matters
    }
    if (skip) continue;
    // Disabled controls are exempt from WCAG contrast.
    if (el.closest("[disabled], [aria-disabled=true]")) continue;
    out.samples.push({ sel: selector(el), text: text(el), color: cs.color, layers, fontSize: parseFloat(cs.fontSize), fontWeight: cs.fontWeight });
  }
  return out;
}

/** The first `n` Tab stops: {sel, before, after} style snapshots around each focus. Run once per stop. */
export function focusSnapshot() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const snap = (e) => {
    const s = getComputedStyle(e);
    return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, outlineColor: s.outlineColor, boxShadow: s.boxShadow, borderColor: s.borderTopColor, backgroundColor: s.backgroundColor };
  };
  const r = el.getBoundingClientRect();
  const parent = el.closest(".chip, .seg-item, label, [data-ring]") || el;
  return { sel: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + (el.getAttribute("class") || "").split(/\s+/).slice(0, 2).join("."), text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 40), now: snap(el), nowParent: snap(parent), visible: r.width > 0 && r.height > 0 };
}

/** Blur-state snapshot for the element that has focus now (taken after blurring it). */
export function blurActive() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const parent = el.closest(".chip, .seg-item, label, [data-ring]") || el;
  el.blur();
  const snap = (e) => {
    const s = getComputedStyle(e);
    return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, outlineColor: s.outlineColor, boxShadow: s.boxShadow, borderColor: s.borderTopColor, backgroundColor: s.backgroundColor };
  };
  return { self: snap(el), parent: snap(parent) };
}

export function isHydrated() {
  // React 19 sets a `__reactFiber$…` key on rendered DOM nodes once it has hydrated them.
  const probe = document.querySelector("a[href], button");
  if (!probe) return document.readyState === "complete";
  return Object.keys(probe).some((k) => k.startsWith("__reactFiber") || k.startsWith("__reactProps"));
}
