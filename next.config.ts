import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second, separate build run beside your dev server (e.g. NEXT_DIST_DIR=.next-test) without touching it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  // Native SQLite binding must not be bundled.
  serverExternalPackages: ["better-sqlite3"],
  // Allow opening the dev server from a phone on the home network.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // Bank statements are uploaded through a Server Action; the default 1MB cap is too small for a PDF.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
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
