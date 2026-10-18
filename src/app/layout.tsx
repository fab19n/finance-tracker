import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ThemeSync } from "@/components/ThemeSync";
import { THEME_COLORS, THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Self-hosted at build time (next/font), so it is part of the saved pages and works without the PC. The design is
// bold-leaning: body 600-700, labels 800, titles and amounts 900.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Koopang",
  description: "Track every ringgit, find the leaks, grow the surplus.",
  // The manifest link is added automatically from src/app/manifest.ts.
  icons: { icon: "/pwa/icon-192.png", apple: "/pwa/icon-180.png" },
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
      className={`${nunito.variable} h-full antialiased`}
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
