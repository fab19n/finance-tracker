/**
 * Fallback shown while a page's data streams in. Each route re-exports it as its own loading.tsx. Shaped like the design's
 * skeleton: a hero, a full block, a two-up pair, two full blocks. Colours are tokens; the pulse only runs when motion is allowed.
 */
const block = "rounded-xl bg-card-subtle motion-safe:animate-pulse";

export default function PageSkeleton() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Loading</span>
      <div aria-hidden className="space-y-3">
        <div className={`${block} h-8 w-40`} />
        <div className={`${block} h-40 rounded-3xl`} />
        <div className={`${block} h-24`} />
        <div className="grid grid-cols-2 gap-3">
          <div className={`${block} h-24`} />
          <div className={`${block} h-24`} />
        </div>
        <div className={`${block} h-20`} />
        <div className={`${block} h-20`} />
      </div>
    </div>
  );
}
