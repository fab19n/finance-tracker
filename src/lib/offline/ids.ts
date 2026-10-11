/**
 * A fresh id for an entry typed on the phone (see transactions.client_id). `crypto.randomUUID` only exists on secure pages
 * (HTTPS, localhost), and the app must still work over plain http:// on the home network, so build one from
 * `getRandomValues` (which is everywhere) when it isn't there. Always matches the PC's /^[A-Za-z0-9-]{8,64}$/.
 */
export function newClientId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 1
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
