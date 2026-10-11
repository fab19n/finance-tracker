import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authToken, safeEqual } from "@/lib/auth-token";

/**
 * Optional PIN lock for when the app is opened from a phone on your Wi-Fi.
 * Off unless APP_PIN is set in .env.local. (This is a convenience lock for a home network,
 * not bank-grade security - don't expose the app to the internet.)
 */
export async function proxy(request: NextRequest) {
  const pin = process.env.APP_PIN;
  if (!pin) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && safeEqual(cookie, await authToken(pin))) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except static assets, the manifest, the generated app icons, and the service worker with its offline page.
  // A phone fetches those before (or without) logging in, and a redirect to /login would be cached as "the offline page".
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|pwa/).*)"],
};
