import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { IMPORT_BODY_OVERHEAD, MAX_IMPORT_BYTES } from "@/lib/import/limits";

describe("next.config security headers", () => {
  it("sets nosniff, a same-origin referrer policy and no framing on every path", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all).toBeTruthy();
    const h = Object.fromEntries(all!.headers.map((x) => [x.key, x.value]));
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("same-origin");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
  });

  it("lets a Server Action body hold the largest statement the reader accepts", () => {
    const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;
    expect(typeof limit).toBe("number");
    expect(limit as number).toBeGreaterThanOrEqual(MAX_IMPORT_BYTES + IMPORT_BODY_OVERHEAD);
  });
});
