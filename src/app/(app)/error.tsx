"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";

/** A page threw: say so plainly. Entries are never lost by this (they are stored on the phone before they are sent). */
export default function ErrorScreen({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-sm py-10">
      <section className="card flex flex-col items-center px-6 py-8 text-center" role="alert">
        <div className="grid size-16 place-items-center rounded-full bg-danger-soft text-danger" aria-hidden>
          <AlertCircle size={28} strokeWidth={2} />
        </div>
        <h1 className="h-page mt-4 text-xl">That didn&apos;t work</h1>
        <p className="sub mt-1">Your PC answered with an error. Your entries are safe on this phone and will send again.</p>
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
