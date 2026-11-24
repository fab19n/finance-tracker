"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { restoreTransaction } from "@/app/actions/transactions";
import { takeDeleted, UNDO_MS } from "@/lib/entry-delete";
import { isUnreachable, UNREACHABLE_MESSAGE } from "@/lib/offline/unreachable";
import { takeUndo, UNDO_EVENT } from "./undo-store";

type Toast = { token: string; phase: "ask" | "busy" | "done" | "failed"; text?: string };

/**
 * "Entry deleted. Undo" for 8 seconds after a delete. The token that puts the entry back comes from the address
 * (`?deleted=<token>`, when the delete redirected: it is removed from the address at once so a reload doesn't show it again)
 * or from sessionStorage (a delete from a list, which stays on the page). The region is always on the page and says what
 * happens (`role="status"`), so a screen reader hears the notice, the result of Undo, and a refusal.
 */
export function UndoToast() {
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    function show(next: Toast, ms: number) {
      if (timer.current) clearTimeout(timer.current);
      setToast(next);
      timer.current = setTimeout(() => setToast(null), ms);
    }
    function pick() {
      const fromUrl = takeDeleted(window.location.search);
      if (fromUrl) {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${fromUrl.rest}${window.location.hash}`);
        show({ token: fromUrl.token, phase: "ask" }, UNDO_MS);
        return;
      }
      const stored = takeUndo(UNDO_MS);
      if (stored) show({ token: stored.token, phase: "ask" }, stored.left);
    }
    pick();
    window.addEventListener(UNDO_EVENT, pick);
    return () => {
      // The timer is left running on purpose: in development React runs this cleanup between two mounts, and the notice
      // picked up by the first would otherwise never be dismissed. A timer firing after a real unmount does nothing.
      window.removeEventListener(UNDO_EVENT, pick);
    };
  }, []);

  async function undo() {
    if (!toast || busy.current) return;
    busy.current = true;
    const token = toast.token;
    if (timer.current) clearTimeout(timer.current);
    setToast({ token, phase: "busy" });
    let next: Toast;
    try {
      const r = await restoreTransaction(token);
      next = r.ok ? { token, phase: "done", text: r.message ?? "Entry restored." } : { token, phase: "failed", text: r.error ?? "Couldn't restore the entry." };
      if (r.ok) router.refresh();
    } catch (e) {
      next = { token, phase: "failed", text: isUnreachable(e) ? UNREACHABLE_MESSAGE : "Couldn't restore the entry. Try again." };
    } finally {
      busy.current = false;
    }
    setToast(next);
    timer.current = setTimeout(() => setToast(null), next.phase === "failed" ? 8000 : 4000);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center md:inset-x-auto md:bottom-6 md:right-6"
    >
      {toast && (
        <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line bg-card px-4 py-2 text-[13.5px] font-bold text-foreground">
          <span className="min-w-0 flex-1">{toast.phase === "ask" || toast.phase === "busy" ? "Entry deleted." : toast.text}</span>
          {(toast.phase === "ask" || toast.phase === "busy") && (
            <button type="button" className="btn min-h-11" onClick={undo} disabled={toast.phase === "busy"}>
              {toast.phase === "busy" ? "Restoring…" : "Undo"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
