import { pwaIcon } from "@/lib/pwa-icon";

// Static: nothing here depends on the request, so it is rendered once at build time.
export function GET() {
  return pwaIcon(512);
}
