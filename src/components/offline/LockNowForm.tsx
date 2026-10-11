"use client";

import { Lock } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { forgetSavedPages } from "@/lib/offline/browser";

/**
 * "Lock now". Signing out also throws away the copies of your pages that this phone keeps for when the PC can't be reached:
 * otherwise a locked app could still be opened offline and show everything. Entries waiting to be sent are not pages and stay,
 * to go once you sign in again. It asks first, because it signs this device out.
 */
export function LockNowForm() {
  return (
    <form action={logout} onSubmit={() => forgetSavedPages()} className="mt-3">
      <ConfirmSubmit
        trigger={
          <>
            <Lock size={16} aria-hidden /> Lock now
          </>
        }
        triggerClassName="btn w-full !border-danger !text-danger"
        title="Lock now?"
        body="Signs this device out and clears the pages saved on it. Entries not yet sent stay on the phone."
        confirmLabel="Lock now"
        tone="neutral"
      />
    </form>
  );
}
