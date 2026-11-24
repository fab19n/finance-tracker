"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, AUTH_MAX_AGE } from "@/lib/auth-token";
import { safeBackPath } from "@/lib/back";
import { issueSession, pinMatches } from "@/lib/session";
import { beginAttempt, loginThrottle, lockMessage, recordSuccess } from "@/lib/session-throttle";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const pin = process.env.APP_PIN;
  const dest = safeBackPath(formData.get("next")) ?? "/dashboard";
  if (!pin) redirect(dest);

  // Count the attempt NOW, before any await: parallel guesses then see each other's count.
  const state = loginThrottle();
  const begun = beginAttempt(state, Date.now());
  if (!begun.ok) return { error: lockMessage(begun.waitSec) };

  const attempt = String(formData.get("pin") ?? "");
  if (!(await pinMatches(attempt, pin))) return { error: "That PIN isn't right." };

  recordSuccess(state);
  let secure = false;
  try {
    secure = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  } catch {
    /* no request headers available: leave the flag off */
  }
  (await cookies()).set(AUTH_COOKIE, await issueSession(pin), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  redirect(dest);
}

export async function logout(): Promise<void> {
  (await cookies()).delete(AUTH_COOKIE);
  redirect("/login");
}
