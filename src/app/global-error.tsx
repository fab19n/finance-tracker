"use client";

import { useEffect } from "react";

/**
 * Last resort: it replaces the root layout, so it brings its own html/body and plain inline styles (no tokens, no fonts,
 * no stylesheet to rely on). It follows the OS colour scheme through `color-scheme` and system colours.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, colorScheme: "light dark", font: "600 16px/1.5 system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", padding: 20, background: "Canvas", color: "CanvasText" }}>
        <main role="alert" style={{ maxWidth: 360, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>That didn&apos;t work</h1>
          <p style={{ margin: "0 0 20px", opacity: 0.8 }}>Nothing was changed by this page. Entries already saved on this phone are kept.</p>
          {error.digest ? <p style={{ margin: "0 0 20px", fontSize: 12, opacity: 0.8 }}>Error reference: {error.digest}</p> : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{ minHeight: 44, width: "100%", border: 0, borderRadius: 999, padding: "10px 18px", font: "inherit", fontWeight: 800, background: "#e0b04a", color: "#101c19", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
