"use client";

import { useLinkStatus } from "next/link";
import { useEffect } from "react";

/** How many things are navigating right now (a tap and a typed search can overlap). */
let navigating = 0;

/**
 * While `on` is true the page body carries `data-navigating`, and globals.css dims whatever is marked
 * `data-dim-on-pending`. A tap on a filter that only changes the address (month, type, account, search) gives the route no
 * loading screen, so without this the list sits unchanged for a moment and the tap looks dead.
 */
export function useNavigating(on: boolean) {
  useEffect(() => {
    if (!on) return;
    navigating += 1;
    document.body.dataset.navigating = "";
    return () => {
      navigating = Math.max(0, navigating - 1);
      if (navigating === 0) delete document.body.dataset.navigating;
    };
  }, [on]);
}

/** Put inside a <Link>: while that link's navigation is pending, the list marked `data-dim-on-pending` dims. Draws nothing. */
export function PendingMark() {
  const { pending } = useLinkStatus();
  useNavigating(pending);
  return pending ? <span className="sr-only"> (loading)</span> : null;
}
