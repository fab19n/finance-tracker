/**
 * Copy the live database to data/backups/ using SQLite's online-backup API, so it is safe to run
 * while the app is open. Keeps the newest 30 copies.
 *
 *   pnpm run backup
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { defaultDbPath } from "../src/db/open";

const KEEP = 30;
const source = defaultDbPath();
if (!fs.existsSync(source)) {
  console.error(`No database found at ${source} - nothing to back up yet.`);
  process.exit(1);
}

const dir = path.join(path.dirname(source), "backups");
fs.mkdirSync(dir, { recursive: true });
const d = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const dest = path.join(dir, `${path.basename(source, ".db")}-${stamp}.db`);

const db = new Database(source, { readonly: true });
db.backup(dest)
  .then(() => {
    db.close();
    const old = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".db"))
      .sort()
      .reverse()
      .slice(KEEP);
    for (const f of old) fs.rmSync(path.join(dir, f));
    console.log(`Backup written: ${dest}${old.length ? ` (pruned ${old.length} old)` : ""}`);
  })
  .catch((e: unknown) => {
    console.error("Backup failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
