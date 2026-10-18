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

  const tone = bad > 0 ? "bg-danger-soft text-danger" : gone ? "bg-warn-soft text-warn" : "bg-good-soft text-good";
  const Icon = bad > 0 ? TriangleAlert : gone ? CloudOff : RefreshCw;
  const label = bad > 0 ? `${bad} failed` : gone ? (waiting > 0 ? `Offline · ${waiting} waiting` : "Offline") : s.syncing ? "Sending…" : `${waiting} waiting`;
  return (
    <Link
      href="/#waiting"
      className={`flex items-center gap-1.5 rounded-full text-[11px] font-extrabold ${tone} ${block ? "px-3.5 py-2.5" : "px-2.5 py-1.5"} ${className}`}
    >
      <Icon size={14} aria-hidden className={s.syncing && !gone && bad === 0 ? "animate-spin" : undefined} />
      {label}
    </Link>
  );
}
