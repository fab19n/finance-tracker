"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/** Failed fetches (a PC that did not answer) and server-action failures: the only errors where the outbox line is relevant. */
const NETWORK = /fetch|network|load failed|server action|failed to connect|timeout/i;

/** A page threw: say so plainly, and only promise what is true. */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const network = NETWORK.test(`${error.name} ${error.message}`);
  return (
    <div className="mx-auto max-w-sm py-10">
      <section className="card flex flex-col items-center px-6 py-8 text-center" role="alert">
        <div className="grid size-16 place-items-center rounded-full bg-danger-soft text-danger" aria-hidden>
          <AlertCircle size={28} strokeWidth={2} />
        </div>
        <h1 className="h-page mt-4 text-xl">That didn&apos;t work</h1>
        <p className="sub mt-1">Nothing was changed by this page.</p>
        {network ? <p className="sub mt-1">The PC may be unreachable. Entries you added on this phone are kept and will send again.</p> : null}
        {error.digest ? <p className="sub mt-2 text-[11px]">Error reference: {error.digest}</p> : null}
        <div className="mt-5 flex w-full flex-col gap-2">
          <button type="button" onClick={() => reset()} className="btn-primary w-full">
            Try again
          </button>
          <Link href="/" className="btn w-full">
            Go to Add
          </Link>
        </div>
      </section>
    </div>
  );
}
