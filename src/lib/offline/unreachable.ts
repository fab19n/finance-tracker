/**
 * Did a Server Action fail because the PC could not be reached (as opposed to the app answering with an error)?
 *
 * A failed fetch is a TypeError in every browser ("Failed to fetch", "Load failed", "NetworkError ..."). When a reverse
 * proxy such as `tailscale serve` answers 502/503/504 for a PC that is off, Next cannot read the reply as an action
 * result and throws "An unexpected response was received from the server." Both mean "nothing reached the app".
 * Anything else (including the redirect Next handles itself) is not this.
 */
export function isUnreachable(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /failed to fetch|networkerror|network request failed|load failed|unexpected response was received from the server/i.test(message);
}

/** Honest about a lost reply: the PC may have saved it just before the connection dropped, so look before trying again. */
export const UNREACHABLE_MESSAGE = "Couldn't reach your PC. Check the list before you try again: it may already have been saved.";
