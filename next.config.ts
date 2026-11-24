import type { NextConfig } from "next";
import { IMPORT_BODY_OVERHEAD, MAX_IMPORT_BYTES } from "./src/lib/import/limits";

// Every response: no sniffing, no referrer to other sites, and no framing (clickjacking of the confirm dialogs).
// A full Content-Security-Policy is deliberately not set: Next's inline bootstrap scripts and the theme script in the root
// layout would need per-request nonces, which cannot work with cached/prerendered shells. frame-ancestors needs none.
export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  // Lets a second, separate build run beside your dev server (e.g. NEXT_DIST_DIR=.next-test) without touching it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  // Native SQLite binding must not be bundled.
  serverExternalPackages: ["better-sqlite3"],
  // Allow opening the dev server from a phone on the home network.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // Bank statements are uploaded through a Server Action; the default 1MB cap is too small for a PDF. At least the reader's
  // own limit (MAX_IMPORT_BYTES) plus the rest of the form, so a file the reader accepts is never cut off earlier.
  experimental: { serverActions: { bodySizeLimit: MAX_IMPORT_BYTES + IMPORT_BODY_OVERHEAD } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
