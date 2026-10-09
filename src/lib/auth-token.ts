/**
 * Pure helpers shared by proxy.ts and the server. Web Crypto only (no Node/Next imports),
 * so it also runs inside the proxy.
 */
export const AUTH_COOKIE = "mt_auth";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();

/** Session token = HMAC-SHA256(key = the PIN, message = a fixed label), hex. Changing the PIN logs everyone out. */
export async function authToken(pin: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("money-tracker-session-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison, so response timing doesn't leak how much of a guess matched. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
