import { SearchX } from "lucide-react";
import Link from "next/link";

/** An entry or account id that doesn't exist (those pages call notFound()). */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-sm py-10">
      <section className="card flex flex-col items-center px-6 py-8 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-accent-soft text-accent-strong" aria-hidden>
          <SearchX size={28} strokeWidth={2} />
        </div>
        <h1 className="h-page mt-4 text-xl">That page isn&apos;t here</h1>
        <p className="sub mt-1">It may have been deleted, or the link is out of date.</p>
        <div className="mt-5 flex w-full flex-col gap-2">
          <Link href="/transactions" className="btn-primary w-full">
            Back to Activity
          </Link>
          <Link href="/dashboard" className="btn w-full">
            Go to Home
          </Link>
        </div>
      </section>
    </div>
  );
}
