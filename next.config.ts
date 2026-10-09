import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Native SQLite binding must not be bundled.
  serverExternalPackages: ["better-sqlite3"],
  // Allow opening the dev server from a phone on the home network.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
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
