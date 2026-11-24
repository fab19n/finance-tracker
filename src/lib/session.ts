import { authToken, pinFingerprint, safeEqual, verifyToken } from "./auth-token";
import { sessionSecret } from "./session-secret";

/** Server-side wrappers: the pure token functions bound to the persisted secret. */
export const issueSession = (pin: string) => authToken(pin, sessionSecret());
export const checkSession = (token: string | undefined, pin: string) => verifyToken(token, pin, sessionSecret());

/** Constant-time PIN check (compares keyed fingerprints, so lengths never leak). */
export async function pinMatches(attempt: string, pin: string): Promise<boolean> {
  const secret = sessionSecret();
  return safeEqual(await pinFingerprint(secret, attempt), await pinFingerprint(secret, pin));
}
