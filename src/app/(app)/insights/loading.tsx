// A route-level Suspense boundary *below* the shared layout, so client navigations get a fallback too.
// Shaped like Insights: the header, the account chips, the headline card, then finding cards.
const block = "rounded-xl bg-card-subtle motion-safe:animate-pulse";

export default function Loading() {
  return (
    <div role="status" className="space-y-3 md:space-y-4">
      <span className="sr-only">Loading Insights</span>
      <div aria-hidden className="space-y-3 md:space-y-4">
        <div className={`${block} h-8 w-40`} />
        <div className="flex gap-2">
          <div className={`${block} h-14 w-28 rounded-2xl`} />
          <div className={`${block} h-14 w-28 rounded-2xl`} />
          <div className={`${block} h-14 w-28 rounded-2xl`} />
        </div>
        <div className={`${block} h-36 rounded-3xl`} />
        <div className={`${block} h-32 rounded-3xl`} />
        <div className={`${block} h-32 rounded-3xl`} />
        <div className={`${block} h-24 rounded-3xl`} />
      </div>
    </div>
  );
}
