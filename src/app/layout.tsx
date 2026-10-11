import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ThemeSync } from "@/components/ThemeSync";
import { THEME_COLORS, THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Money Tracker",
  description: "Track every ringgit, find the leaks, grow the surplus.",
  // The manifest link is added automatically from src/app/manifest.ts.
  icons: { icon: "/pwa/icon-192.png", apple: "/pwa/icon-180.png" },
  appleWebApp: { capable: true, title: "Money", statusBarStyle: "default" },
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
