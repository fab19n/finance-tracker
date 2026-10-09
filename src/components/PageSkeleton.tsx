/** Fallback shown while a page's data streams in. Each route re-exports it as its own loading.tsx. */
export default function PageSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-line" />
      <div className="h-40 animate-pulse rounded-2xl bg-line" />
      <div className="h-24 animate-pulse rounded-2xl bg-line" />
    </div>
  );
}
