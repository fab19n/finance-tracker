import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Money Tracker",
    short_name: "Money",
    description: "Track every ringgit, find the leaks, grow the surplus.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // A manifest holds one colour, so the dark page colour (it matches the icon's deep-green family and the launch
    // splash); the page itself sets the real, per-theme colour with <meta name="theme-color"> (see src/lib/theme.ts).
    background_color: "#0b1210",
    theme_color: "#0b1210",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add entry", short_name: "Add", url: "/" },
      { name: "Insights", short_name: "Insights", url: "/insights" },
      { name: "Investments", short_name: "Invest", url: "/invest" },
    ],
  };
}
