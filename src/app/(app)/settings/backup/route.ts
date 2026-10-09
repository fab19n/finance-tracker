import { getDb } from "@/db/client";
import { todayISO } from "@/lib/dates";

/** Download a consistent snapshot of the whole database (restore by replacing data/finance.db with it). */
export async function GET() {
  const db = await getDb();
  const snapshot = (db as unknown as { $client: { serialize(): Buffer } }).$client.serialize();
  return new Response(new Uint8Array(snapshot), {
    headers: {
      "content-type": "application/vnd.sqlite3",
      "content-disposition": `attachment; filename="money-tracker-backup-${todayISO()}.db"`,
      "cache-control": "no-store",
    },
  });
}
