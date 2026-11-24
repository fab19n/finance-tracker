import type { ReactNode } from "react";

/**
 * Fallback shown while a page's data streams in. Each route re-exports it as its own loading.tsx. Shaped like the design's
 * skeleton: the page's real title on top (so nothing jumps when the page arrives), then a 44 px pill, a 140 px hero, a 68 px
 * pair, a 150 px block and a short line, all raised-colour blocks with radius 12. Colours are tokens; the pulse only runs
 * when motion is allowed. Pass `title` (the same text as the page's PageHeader) to show it; without one a bar stands in.
 */
const block = "rounded-xl bg-card-subtle motion-safe:animate-pulse";

export default function PageSkeleton({ title }: { title?: ReactNode }) {
  return (
    <div className="space-y-3">
      {title ? <h1 className="h-page">{title}</h1> : <div aria-hidden className={`${block} h-8 w-40`} />}
      <div role="status">
        <span className="sr-only">Loading</span>
        <div aria-hidden className="space-y-3">
          <div className={`${block} h-11 rounded-full`} />
          <div className={`${block} h-[140px]`} />
          <div className="grid grid-cols-2 gap-3">
            <div className={`${block} h-[68px]`} />
            <div className={`${block} h-[68px]`} />
          </div>
          <div className={`${block} h-[150px]`} />
          <div className={`${block} h-4 w-2/5`} />
        </div>
      </div>
    </div>
  );
}
