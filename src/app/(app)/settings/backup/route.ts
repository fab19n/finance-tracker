import { getDb } from "@/db/client";
import { todayISO } from "@/lib/dates";

/**
 * Download a consistent snapshot of the whole database (restore by replacing data/finance.db with it).
 *
 * Without APP_PIN the app is open to anyone who can reach the port, and the request's Host header can be forged, so no
 * request can be told apart as "from this computer": the download is refused outright until a PIN is set. (On the PC
 * itself, `pnpm run backup` writes the same snapshot to data/backups.)
 */
export async function GET() {
  if (!process.env.APP_PIN) {
    return new Response("The backup download needs a PIN. Set APP_PIN in .env.local (see the README), or run `pnpm run backup` on this computer.", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const db = await getDb();
  const snapshot = (db as unknown as { $client: { serialize(): Buffer } }).$client.serialize();
  return new Response(new Uint8Array(snapshot), {
    headers: {
      "content-type": "application/vnd.sqlite3",
      "content-disposition": `attachment; filename="koopang-backup-${todayISO()}.db"`,
      "cache-control": "no-store",
    },
  });
}
