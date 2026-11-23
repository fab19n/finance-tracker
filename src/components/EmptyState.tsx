import Link from "next/link";
import type { ReactNode } from "react";

type Action = { label: string; href: string };

/**
 * The design's empty state: a 64 px icon disc, a 16 px extrabold title, a sub line and up to two full-width buttons (a gold
 * primary and a secondary). Honest wording only: it says what is missing and offers the real next step.
 */
export function EmptyState({
  icon,
  title,
  text,
  primary,
  secondary,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  text: string;
  primary?: Action;
  secondary?: Action;
  className?: string;
}) {
  return (
    <section className={`card flex flex-col items-center px-6 py-8 text-center ${className}`}>
      <div className="grid size-16 place-items-center rounded-full bg-accent-soft text-accent-strong" aria-hidden>
        {icon}
      </div>
      <h2 className="mt-4 text-base font-extrabold">{title}</h2>
      <p className="sub mt-1 max-w-xs">{text}</p>
      {(primary || secondary) && (
        <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
          {primary && (
            <Link href={primary.href} className="btn-primary w-full">
              {primary.label}
            </Link>
          )}
          {secondary && (
            <Link href={secondary.href} className="btn w-full">
              {secondary.label}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
