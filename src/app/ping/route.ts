import { connection } from "next/server";

/**
 * "Is the PC there?" The phone asks every so often; any answer at all means yes (even a redirect to the login page).
 * It says nothing about your data. `connection()` makes it answer from the live server on every call: Next would otherwise
 * bake a constant reply like this into the build.
 */
export async function GET() {
  await connection();
  return new Response("ok", { status: 200, headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
