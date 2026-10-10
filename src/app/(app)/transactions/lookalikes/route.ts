import { z } from "zod";
import { getDb } from "@/db/client";
import { findLookalikes } from "@/lib/queries/lookalikes";

const Params = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  account: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive().optional(),
});

/**
 * "Already in your books?" for the Add form: imported entries that look like the one being typed (see lookalikes.ts).
 * A route handler rather than a Server Action because it only reads, and Next runs actions one at a time per client:
 * a lookup should never make Save wait. Still behind the PIN lock, like every other route (src/proxy.ts).
 */
export async function GET(request: Request) {
  const parsed = Params.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success || (parsed.data.type === "transfer" && !parsed.data.to)) return Response.json({ matches: [] }, { status: 400 });
  const { type, amount, date, account, to } = parsed.data;
  const matches = findLookalikes(await getDb(), { type, amount, date, accountId: account, toAccountId: type === "transfer" ? (to ?? null) : null });
  return Response.json({ matches }, { headers: { "cache-control": "no-store" } });
}
