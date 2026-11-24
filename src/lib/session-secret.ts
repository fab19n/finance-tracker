import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * The server's signing secret: 32 random bytes (64 hex characters), created once and kept in a file next to the database
 * (data/ is gitignored), never in the repo's tracked files and never logged. Node only (the proxy runs on Node in Next 16).
 * `SESSION_SECRET_FILE` overrides the location (tests).
 *
 * Creation is atomic: the secret is written in full to a private temporary file and then hard-linked into place, which
 * fails if the real file already exists. Another process (the proxy and the page workers are separate) can therefore never
 * read a half-written secret, and a value that is too short is never used or cached.
 */
const HEX_LENGTH = 64;

export function sessionSecretPath(): string {
  if (process.env.SESSION_SECRET_FILE) return process.env.SESSION_SECRET_FILE;
  const db = process.env.DB_PATH;
  const dir = db && db !== ":memory:" ? path.dirname(db) : path.join(process.cwd(), "data");
  return path.join(dir, "session-secret");
}

const cache = globalThis as unknown as { __mtSessionSecret?: { file: string; value: string } };

function readValid(file: string): string | null {
  try {
    const value = fs.readFileSync(file, "utf8").trim();
    return value.length >= HEX_LENGTH ? value : null;
  } catch {
    return null;
  }
}

export function sessionSecret(): string {
  const file = sessionSecretPath();
  if (cache.__mtSessionSecret?.file === file) return cache.__mtSessionSecret.value;

  let value = readValid(file);
  if (!value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fresh = crypto.randomBytes(HEX_LENGTH / 2).toString("hex");
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, fresh, { mode: 0o600 });
    try {
      // A damaged (too short) file is replaced; a good one that appeared meanwhile wins the race below.
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
      fs.linkSync(tmp, file);
    } catch {
      // Another process linked its secret first: read theirs.
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    value = readValid(file);
    if (!value) throw new Error("The session secret could not be created");
  }
  cache.__mtSessionSecret = { file, value };
  return value;
}
