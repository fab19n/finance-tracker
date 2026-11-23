"use client";

/**
 * Last resort: it replaces the root layout, so it brings its own html/body and plain inline styles (no tokens, no fonts,
 * no stylesheet to rely on). It follows the OS colour scheme through `color-scheme` and system colours.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, colorScheme: "light dark", font: "600 16px/1.5 system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", padding: 20, background: "Canvas", color: "CanvasText" }}>
        <main role="alert" style={{ maxWidth: 360, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>That didn&apos;t work</h1>
          <p style={{ margin: "0 0 20px", opacity: 0.8 }}>Your PC answered with an error. Your entries are safe on this phone and will send again.</p>
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
