import type { PostFn, PostOutcome } from "./types";

/**
 * What a proxy in front of the app says when the APP isn't there: `tailscale serve` (like any reverse proxy) answers 502
 * Bad Gateway, or sometimes 503 or 504, instead of staying silent. That happens whenever the PC has restarted and nothing
 * has started the app yet. For the phone it is exactly "can't reach your PC"; the app itself never answers with these.
 */
export const isGatewayFailure = (status: number) => status === 502 || status === 503 || status === 504;

/** Run `fn` with a time limit. Whatever it throws, including the timeout, becomes `fallback`. */
export async function within<T>(ms: number, fallback: T, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export type Network = {
  /** Send entries to the PC (see src/app/sync/entries/route.ts). */
  post: PostFn;
  /** Is the PC there? An answer from the app, even the login page, is yes; silence, or a proxy's "bad gateway", is no. */
  probe: () => Promise<boolean>;
};

/** The phone's two conversations with the PC. `fetchImpl` is the browser's fetch (a stand-in in tests). */
export function createNetwork(fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Network {
  const post: PostFn = (entries, options) =>
    within<PostOutcome>(options?.timeoutMs ?? 20_000, { kind: "unreachable" }, async (signal) => {
      const res = await fetchImpl("/sync/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries }),
        cache: "no-store",
        signal,
      });
      if (isGatewayFailure(res.status)) return { kind: "unreachable" };
      // The PIN lock sends a stranger to /login, and fetch follows it: a login page where JSON should be means "sign in again".
      if (res.redirected && new URL(res.url).pathname.startsWith("/login")) return { kind: "login" };
      const json = res.ok && (res.headers.get("content-type") ?? "").includes("application/json") ? await res.json() : null;
      return json && Array.isArray(json.results) ? { kind: "results", results: json.results } : { kind: "error", status: res.status };
    });

  const probe = () =>
    within(4000, false, async (signal) => {
      const res = await fetchImpl("/ping", { cache: "no-store", signal });
      return !isGatewayFailure(res.status);
    });

  return { post, probe };
}
