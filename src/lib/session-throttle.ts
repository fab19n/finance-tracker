/**
 * Login guess limiter. Pure apart from the state object; `begin` is synchronous so that parallel requests cannot all
 * pass a check that only the first one has updated: every attempt is counted BEFORE the PIN is verified.
 *
 * Five attempts per window; the fifth starts a lock (the fifth itself is still judged), so a burst of any size gets
 * at most five guesses. Each further lock doubles (1 min, 2, 4 ... capped at 15 minutes, so one burst of bad guesses can never keep the owner out for long); a correct PIN clears everything.
 */
export const MAX_ATTEMPTS = 5;
export const BASE_LOCK_MS = 60_000;
export const MAX_LOCK_MS = 15 * 60_000;

export type ThrottleState = { attempts: number; lockedUntil: number; locks: number };
export const freshThrottle = (): ThrottleState => ({ attempts: 0, lockedUntil: 0, locks: 0 });

export type Begin = { ok: true } | { ok: false; waitSec: number };

export function beginAttempt(s: ThrottleState, now: number): Begin {
  if (now < s.lockedUntil) return { ok: false, waitSec: Math.ceil((s.lockedUntil - now) / 1000) };
  s.attempts += 1;
  if (s.attempts >= MAX_ATTEMPTS) {
    s.attempts = 0;
    s.lockedUntil = now + Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** s.locks);
    s.locks += 1;
  }
  return { ok: true };
}

/** A correct PIN: forget failures and any lock the same burst started. */
export function recordSuccess(s: ThrottleState): void {
  s.attempts = 0;
  s.lockedUntil = 0;
  s.locks = 0;
}

/** "Too many wrong attempts. Try again in 45 s." (minutes from two minutes up). */
export function lockMessage(waitSec: number): string {
  const wait = waitSec >= 120 ? `${Math.ceil(waitSec / 60)} min` : `${waitSec} s`;
  return `Too many wrong attempts. Try again in ${wait}.`;
}

const g = globalThis as unknown as { __mtThrottle?: ThrottleState };
/** One shared state per process, even if the module is loaded twice by the bundler. */
export const loginThrottle = (): ThrottleState => (g.__mtThrottle ??= freshThrottle());
