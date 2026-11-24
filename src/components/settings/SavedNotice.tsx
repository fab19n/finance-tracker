import { CheckCircle2 } from "lucide-react";
import { savedMessage } from "@/lib/saved-notice";

/** The green "Saved" banner a page shows after one of its forms worked (`?saved=` and `?note=` in the address). Nothing when absent. */
export function SavedNotice({ saved, note }: { saved: string | string[] | undefined; note?: string | string[] | undefined }) {
  const message = savedMessage(saved, note);
  if (!message) return null;
  return (
    <p role="status" className="banner banner-good">
      <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span className="min-w-0">{message}</span>
    </p>
  );
}
