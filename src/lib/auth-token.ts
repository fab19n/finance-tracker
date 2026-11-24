/**
 * Pure session-token helpers (Web Crypto only, no Node/Next imports). The server secret comes in as a parameter;
 * src/lib/session.ts supplies it from a file outside the tracked sources.
 *
 * Token = "<expiry>.<hmac>" where expiry is unix seconds and
 *   hmac = HMAC-SHA256(secret, "money-tracker-session-v1|" + pinFingerprint + "|" + expiry), hex,
 *   pinFingerprint = HMAC-SHA256(secret, "pin|" + pin), hex.
 * Without the secret nobody can compute a token, even knowing the PIN space; a PIN change changes the fingerprint, so
 * every old cookie stops verifying; the server enforces the expiry itself.
 */
export const AUTH_COOKIE = "mt_auth";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const LABEL = "money-tracker-session-v1";

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A keyed fingerprint of the PIN: what is compared at login, and what ties a token to the current PIN. */
export const pinFingerprint = (secret: string, pin: string) => hmacHex(secret, `pin|${pin}`);

/** Issues a token valid for `AUTH_MAX_AGE` seconds from `nowMs`. */
export async function authToken(pin: string, secret: string, nowMs: number = Date.now()): Promise<string> {
  const expiry = Math.floor(nowMs / 1000) + AUTH_MAX_AGE;
  const mac = await hmacHex(secret, `${LABEL}|${await pinFingerprint(secret, pin)}|${expiry}`);
  return `${expiry}.${mac}`;
}

/** True only for an unexpired token signed with this secret for this PIN. */
export async function verifyToken(token: string | undefined, pin: string, secret: string, nowMs: number = Date.now()): Promise<boolean> {
  if (!token) return false;
  const m = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return false;
  const expiry = Number(m[1]);
  const nowS = Math.floor(nowMs / 1000);
  if (expiry <= nowS || expiry > nowS + AUTH_MAX_AGE + 60) return false;
  const mac = await hmacHex(secret, `${LABEL}|${await pinFingerprint(secret, pin)}|${expiry}`);
  return safeEqual(m[2], mac);
}

/** Constant-time string comparison, so response timing doesn't leak how much of a guess matched. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
