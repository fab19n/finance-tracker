// A route-level Suspense boundary *below* the shared layout, so client navigations get a fallback too.
// Shaped like Home: the header, the period toggles, the hero with three tiles, then the cards.
const block = "rounded-xl bg-card-subtle motion-safe:animate-pulse";

export default function Loading() {
  return (
    <div role="status" className="space-y-3 md:space-y-4">
      <span className="sr-only">Loading Home</span>
      <h1 className="h-page">Home</h1>
      <div aria-hidden className="space-y-3 md:space-y-4">
        <div className="flex flex-col gap-2.5 md:flex-row md:gap-3">
          <div className={`${block} h-11 w-52 rounded-full`} />
          <div className={`${block} h-11 flex-1 rounded-full md:max-w-72`} />
        </div>
        <div className="grid grid-cols-3 gap-2.5 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:gap-3">
          <div className={`${block} col-span-3 h-40 rounded-3xl md:col-span-1`} />
          <div className={`${block} h-24 rounded-3xl`} />
          <div className={`${block} h-24 rounded-3xl`} />
          <div className={`${block} h-24 rounded-3xl`} />
        </div>
        <div className={`${block} h-48 rounded-3xl`} />
        <div className={`${block} h-40 rounded-3xl`} />
        <div className={`${block} h-40 rounded-3xl`} />
      </div>
    </div>
  );
}
