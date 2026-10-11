"use client";

import { logout } from "@/app/actions/auth";
import { forgetSavedPages } from "@/lib/offline/browser";

/**
 * "Lock now". Signing out also throws away the copies of your pages that this phone keeps for when the PC can't be reached:
 * otherwise a locked app could still be opened offline and show everything. Entries waiting to be sent are not pages and stay,
 * to go once you sign in again.
 */
export function LockNowForm() {
  return (
    <form action={logout} onSubmit={() => forgetSavedPages()} className="mt-2">
      <button className="btn">Lock now</button>
    </form>
  );
}
