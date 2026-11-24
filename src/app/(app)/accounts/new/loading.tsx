import PageSkeleton from "@/components/PageSkeleton";

// A route-level Suspense boundary *below* the shared layout, so client navigations get a fallback too.
// The skeleton shows the page's real title (the same title as the page's header, so nothing jumps when the page arrives).
export default function Loading() {
  return <PageSkeleton title="New account" />;
}
