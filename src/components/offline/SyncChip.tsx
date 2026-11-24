"use client";

import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { failed, pending } from "@/lib/offline/offline-store";
import { useOfflineState } from "./hooks";

/**
 * A small badge, there only when something needs your attention: the PC can't be reached, entries are waiting to be
 * sent, or the PC refused some. Tapping it goes to the list. On a phone it sits in the page header; on a desktop, in the
 * sidebar (`block`).
 */
export function SyncChip({ block = false, className = "" }: { block?: boolean; className?: string }) {
  const s = useOfflineState();
  const waiting = pending(s).length;
  const bad = failed(s).length;
  const gone = s.connection === "offline";
  if (!gone && waiting === 0 && bad === 0) return null;

  // Stuck is not the same as waiting: the PC is there but wants the PIN, or is erroring, so the entries will not go on their own.
  const stuck = !gone && bad === 0 && waiting > 0 && (s.needsLogin || s.serverError !== null);
  const tone = bad > 0 ? "bg-danger-soft text-danger" : gone || stuck ? "bg-warn-soft text-warn" : "bg-good-soft text-good";
  const Icon = bad > 0 || stuck ? TriangleAlert : gone ? CloudOff : RefreshCw;
  const label =
    bad > 0
      ? `${bad} failed`
      : gone
        ? waiting > 0
          ? `Offline · ${waiting} waiting`
          : "Offline"
        : stuck
          ? `${waiting} waiting · ${s.needsLogin ? "sign in" : "PC error"}`
          : s.syncing
            ? "Sending…"
            : `${waiting} waiting`;
  return (
    <Link
      href="/#waiting"
      className={`flex min-h-11 items-center gap-1.5 rounded-full text-[11px] font-extrabold ${tone} ${block ? "px-3.5 py-2.5" : "px-3 py-1.5"} ${className}`}
    >
      <Icon size={14} aria-hidden className={s.syncing && !gone && bad === 0 ? "animate-spin" : undefined} />
      {label}
    </Link>
  );
}
