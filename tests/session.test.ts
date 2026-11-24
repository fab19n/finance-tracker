import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionSecret, sessionSecretPath } from "@/lib/session-secret";
import { BASE_LOCK_MS, beginAttempt, freshThrottle, lockMessage, recordSuccess } from "@/lib/session-throttle";

let dir = "";
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-secret-"));
  process.env.SESSION_SECRET_FILE = path.join(dir, "nested", "session-secret");
  delete (globalThis as { __mtSessionSecret?: unknown }).__mtSessionSecret;
});
afterEach(() => {
  delete process.env.SESSION_SECRET_FILE;
  delete process.env.DB_PATH;
  delete (globalThis as { __mtSessionSecret?: unknown }).__mtSessionSecret;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("server secret", () => {
  it("is created once (64 hex), persisted, and reused after the in-memory copy is gone", () => {
    const a = sessionSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.readFileSync(sessionSecretPath(), "utf8").trim()).toBe(a);
    delete (globalThis as { __mtSessionSecret?: unknown }).__mtSessionSecret;
    expect(sessionSecret()).toBe(a);
  });
  it("replaces a truncated file instead of using a weak secret", () => {
    fs.mkdirSync(path.dirname(sessionSecretPath()), { recursive: true });
    fs.writeFileSync(sessionSecretPath(), "abc");
    expect(sessionSecret()).toMatch(/^[0-9a-f]{64}$/);
  });
  it("lives next to the database, never in the repo tree", () => {
    delete process.env.SESSION_SECRET_FILE;
    process.env.DB_PATH = path.join(dir, "x.db");
    expect(sessionSecretPath()).toBe(path.join(dir, "session-secret"));
  });
});

describe("login throttle", () => {
  it("counts every attempt up front: five get through, the rest wait", () => {
    const s = freshThrottle();
    const verdicts = Array.from({ length: 20 }, () => beginAttempt(s, 1000));
    expect(verdicts.filter((v) => v.ok)).toHaveLength(5);
    expect(verdicts[5]).toEqual({ ok: false, waitSec: 60 });
  });
  it("doubles each further lock, up to 15 minutes, and a correct PIN clears it", () => {
    const s = freshThrottle();
    let now = 0;
    const burst = () => {
      for (let i = 0; i < 5; i++) beginAttempt(s, now);
    };
    burst();
    expect(s.lockedUntil - now).toBe(BASE_LOCK_MS);
    now = s.lockedUntil;
    burst();
    expect(s.lockedUntil - now).toBe(BASE_LOCK_MS * 2);
    for (let i = 0; i < 10; i++) {
      now = s.lockedUntil;
      burst();
    }
    expect(s.lockedUntil - now).toBe(15 * 60_000);
    recordSuccess(s);
    expect(beginAttempt(s, now)).toEqual({ ok: true });
    expect(s.locks).toBe(0);
  });
  it("words the wait in seconds, then minutes", () => {
    expect(lockMessage(45)).toBe("Too many wrong attempts. Try again in 45 s.");
    expect(lockMessage(600)).toBe("Too many wrong attempts. Try again in 10 min.");
  });
});
