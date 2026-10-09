import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, authToken, safeEqual } from "./auth-token";

/** The lock is opt-in: set APP_PIN in .env.local to turn it on. */
export const pinEnabled = () => !!process.env.APP_PIN;

/**
 * Called from getDb(), the single door to the database. Even if proxy.ts were misconfigured or
 * bypassed, nothing can be read or written without the PIN when the lock is on.
 */
export async function requireAuth(): Promise<void> {
  const pin = process.env.APP_PIN;
  if (!pin) return;
  const cookie = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!cookie || !safeEqual(cookie, await authToken(pin))) redirect("/login");
}
