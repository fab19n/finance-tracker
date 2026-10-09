"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, AUTH_MAX_AGE, authToken, safeEqual } from "@/lib/auth-token";

// Slow down guessing: after 5 wrong PINs, refuse everything for a minute.
let failures = 0;
let lockedUntil = 0;

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const pin = process.env.APP_PIN;
  const next = String(formData.get("next") ?? "/");
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!pin) redirect(dest);

  if (Date.now() < lockedUntil) return { error: "Too many wrong attempts. Wait a minute and try again." };

  const attempt = String(formData.get("pin") ?? "");
  if (!safeEqual(await authToken(attempt), await authToken(pin))) {
    failures += 1;
    if (failures >= 5) {
      lockedUntil = Date.now() + 60_000;
      failures = 0;
    }
    return { error: "That PIN isn't right." };
  }
  failures = 0;
  (await cookies()).set(AUTH_COOKIE, await authToken(pin), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  redirect(dest);
}

export async function logout(): Promise<void> {
  (await cookies()).delete(AUTH_COOKIE);
  redirect("/login");
}
