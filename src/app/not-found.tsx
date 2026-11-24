import { SearchX } from "lucide-react";
import Link from "next/link";
import { KoopangLogo } from "@/components/KoopangLogo";

/**
 * An address that matches no route at all. It renders inside the root layout but outside the app shell (no tab bar, no
 * sidebar), so it carries the logo and its own way back: Home and Activity.
 */
export default function RootNotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center gap-5 px-4 py-10">
      <KoopangLogo height={28} className="mx-auto text-foreground" />
      <section className="card flex flex-col items-center px-6 py-8 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-accent-soft text-accent-strong" aria-hidden>
          <SearchX size={28} strokeWidth={2} />
        </div>
        <h1 className="h-page mt-4 text-xl">That page isn&apos;t here</h1>
        <p className="sub mt-1">The address may be mistyped, or the link is out of date.</p>
        <div className="mt-5 flex w-full flex-col gap-2">
          <Link href="/dashboard" className="btn-primary w-full">
            Go to Home
          </Link>
          <Link href="/transactions" className="btn w-full">
            Back to Activity
          </Link>
        </div>
      </section>
    </main>
  );
}
