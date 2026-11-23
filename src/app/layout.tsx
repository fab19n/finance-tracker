import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ThemeSync } from "@/components/ThemeSync";
import { THEME_COLORS, THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Self-hosted at build time (next/font), so both are part of the saved pages and work without the PC. Manrope is the
// UI face (body 600, labels 700-800); Sora is for page titles (600), and moves to the big figures in a later phase.
// Neither has a 900, so the existing font-black (900) classes render at 800.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Koopang",
  description: "Track every ringgit, find the leaks, grow the surplus.",
  // The manifest link is added automatically from src/app/manifest.ts.
  // The tab icon: the K. An SVG for browsers that take one (sharp at any size), the PNG as a fallback, and src/app/favicon.ico
  // (Next adds that one itself) for everything else. All three are under /pwa/ or the PIN lock's exemptions, so the login page
  // shows the icon too. The home-screen icon is the apple one.
  icons: {
    icon: [
      { url: "/pwa/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/pwa/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/pwa/icon-180.png",
  },
  appleWebApp: { capable: true, title: "Koopang", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Follows the OS; ThemeSync swaps these for the chosen colour when the user forces Light or Dark on this device.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions (screen recorders, translators, dark-mode tools) add attributes to <html> before React
    // hydrates, and the theme script below sets data-theme there on purpose. suppressHydrationWarning silences that one
    // element only; a real mismatch anywhere inside the page is still reported.
    <html
      lang="en"
      className={`${manrope.variable} ${sora.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies a forced Light/Dark choice before first paint, so it never flashes the other theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
        <ThemeSync />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
