import PageSkeleton from "@/components/PageSkeleton";

// A route-level Suspense boundary *below* the shared layout, so client navigations get a fallback too.
// The skeleton shows the page's real title (the title is the account's own name, which is not known until the page loads (a bar stands in)).
export default function Loading() {
  return <PageSkeleton />;
}
