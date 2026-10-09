import { ImageResponse } from "next/og";

/**
 * The app icon: white "RM" on emerald. Full-bleed (no rounded corners) so the same image works
 * as a regular icon and as a maskable one, where the OS crops it to its own shape.
 */
export function pwaIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#047857",
          color: "#ffffff",
          fontSize: Math.round(size * 0.4),
          fontWeight: 800,
          letterSpacing: -2,
        }}
      >
        RM
      </div>
    ),
    { width: size, height: size },
  );
}
