import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { DB } from "@/db/open";
import { transactions } from "@/db/schema";
import { checkEntry } from "@/lib/entries";

const MAX_BODY_BYTES = 200_000;

// Lenient on VALUES (zero amounts, impossible dates and the like are judged per entry, so one bad entry never sinks the
// batch) and strict only on SHAPE, which a correct phone always gets right.
const Entry = z.object({
  clientId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number(),
  date: z.string(),
  accountId: z.number(),
  toAccountId: z.number().nullish(),
  categoryId: z.number().nullish(),
  item: z.string().max(120).nullish(),
  note: z.string().max(500).nullish(),
});
const Body = z.object({ entries: z.array(Entry).min(1).max(50) });

type Result = { clientId: string; status: "saved" | "duplicate" | "rejected"; id?: number; error?: string };

function saveOne(db: DB, e: z.infer<typeof Entry>): Result {
  const known = () => db.select({ id: transactions.id }).from(transactions).where(eq(transactions.clientId, e.clientId)).get();

  // Already here: an earlier attempt got through and only the reply was lost. Success, not an error.
  const seen = known();
  if (seen) return { clientId: e.clientId, status: "duplicate", id: seen.id };

  const checked = checkEntry(db, {
    type: e.type,
    amount: e.amount,
    date: e.date,
    accountId: e.accountId,
    toAccountId: e.toAccountId ?? null,
    categoryId: e.categoryId ?? null,
    item: e.item ?? null,
    note: e.note ?? null,
  });
  if (!checked.ok) return { clientId: e.clientId, status: "rejected", error: checked.error };

  try {
    const { id } = db.insert(transactions).values({ ...checked.row, clientId: e.clientId }).returning({ id: transactions.id }).get();
    return { clientId: e.clientId, status: "saved", id };
  } catch (error) {
    // Two requests carrying the same entry raced, and the unique index let exactly one in. That is "already here" too.
    const raced = known();
    if (raced) return { clientId: e.clientId, status: "duplicate", id: raced.id };
    throw error;
  }
}

/**
 * The phone's outbox lands here: entries typed while the PC could not be reached, sent again and again until the PC
 * answers. Every entry gets its own verdict, so a good one is never held up by a bad one, and re-sending is always safe
 * (see transactions.client_id). Behind the PIN lock like every other route; the phone treats a redirect to /login as
 * "sign in again".
 */
export async function POST(request: Request) {
  // A JSON body can't be sent cross-site by a plain form, and the login cookie is SameSite=Lax anyway: belt and braces.
  if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Not from another site" }, { status: 403 });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Send JSON" }, { status: 415 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return Response.json({ error: "Too much at once" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "That wasn't JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Those entries weren't in the expected shape" }, { status: 400 });

  const db = await getDb();
  const results = parsed.data.entries.map((e) => saveOne(db, e));
  if (results.some((r) => r.status === "saved")) revalidatePath("/", "layout");
  return Response.json({ results }, { headers: { "cache-control": "no-store" } });
}
