import { connection } from "next/server";
import { parseTxSearch } from "@/lib/queries/filters";
import { sumTransactions } from "@/lib/queries/transactions";

/**
 * How many entries a set of filters matches: the Filter sheet's live "Show N entries". It reads the same address the page
 * does (`parseTxSearch`, so a reversed range or an unreadable amount is treated exactly as the page treats it) and counts with
 * the same `sumTransactions` the page's own totals use, so the number on the button is the number on the page. A route
 * handler, not a Server Action, because it only reads and must never queue behind a Save. Behind the PIN lock like every
 * other route; never cached.
 */
export async function GET(request: Request) {
  // parseTxSearch defaults the month to "now": the clock must be read at request time.
  await connection();
  const view = parseTxSearch(Object.fromEntries(new URL(request.url).searchParams));
  const totals = await sumTransactions(view.filters);
  return Response.json({ count: totals.count }, { headers: { "cache-control": "no-store" } });
}
