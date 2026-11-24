"use client";

import { Check, CloudOff, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, type ComponentType, type ReactNode } from "react";
import { offlineStore } from "@/lib/offline/browser";
import { failed, pending } from "@/lib/offline/offline-store";
import { since, useOfflineState, when } from "./hooks";

const TONES = { warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", good: "bg-good-soft text-good" } as const;

function Row({ tone, icon: Icon, children, alert = false }: { tone: keyof typeof TONES; icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>; children: ReactNode; alert?: boolean }) {
  return (
    <div role={alert ? "alert" : undefined} className={`flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-[13px] font-bold ${TONES[tone]}`}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const entries = (n: number) => (n === 1 ? "1 entry" : `${n} entries`);

/**
 * What to tell you, at the top of every page, about the PC and about entries typed on this phone: that the PC can't be
 * reached (and that this page is a saved copy, from when), that entries are waiting, that the PC wants the PIN again or has
 * a problem, that some were refused (red: they need you), and, for a few seconds, that something went through.
 */
export function SyncBanner() {
  const s = useOfflineState();
  const [looking, setLooking] = useState(false);
  const waiting = pending(s).length;
  const bad = failed(s).length;
  const rows: ReactNode[] = [];

  if (bad > 0) {
    rows.push(
      <Row key="failed" tone="danger" icon={TriangleAlert} alert>
        {entries(bad)} couldn&apos;t be saved on your PC.{" "}
        <Link href="/#waiting" className="font-semibold underline">
          Review
        </Link>
      </Row>,
    );
  }
  if (s.needsLogin && waiting > 0) {
    rows.push(
      <Row key="login" tone="warn" icon={TriangleAlert} alert>
        Sign in again to send the {entries(waiting)} waiting on this phone.{" "}
        <Link href="/login?next=/" className="font-semibold underline">
          Sign in
        </Link>
      </Row>,
    );
  } else if (s.serverError !== null && waiting > 0) {
    rows.push(
      <Row key="error" tone="warn" icon={TriangleAlert}>
        Your PC answered with an error, so {entries(waiting)} {waiting === 1 ? "is" : "are"} still waiting. It will keep trying.
      </Row>,
    );
  }
  // A page opened from this phone's own copy says so at once, with its age, before anything has found out whether the PC answers.
  if (s.savedCopyAt !== null && s.connection !== "offline") {
    rows.push(
      <Row key="copy" tone="warn" icon={CloudOff}>
        <strong>This page is a saved copy</strong> from {since(s.savedCopyAt)} ({when(s.savedCopyAt)}). It updates when your PC answers.
      </Row>,
    );
  }
  if (s.connection === "offline") {
    rows.push(
      <Row key="offline" tone="warn" icon={CloudOff}>
        <strong>Can&apos;t reach your PC.</strong>{" "}
        {s.savedCopyAt ? `This page is a saved copy from ${since(s.savedCopyAt)} (${when(s.savedCopyAt)}). ` : s.lastOnlineAt ? `It was last reachable ${when(s.lastOnlineAt)}. ` : ""}
        {waiting > 0
          ? `${entries(waiting)} ${waiting === 1 ? "is" : "are"} waiting. They go when you open the app with your PC reachable. `
          : "Entries you add are kept on this phone and sent the next time you open the app with your PC reachable. "}
        <button
          type="button"
          className="font-semibold underline disabled:opacity-60"
          disabled={looking}
          onClick={async () => {
            setLooking(true);
            await offlineStore().check();
            setLooking(false);
          }}
        >
          {looking ? "Looking…" : "Try now"}
        </button>
      </Row>,
    );
  }
  if (s.sent) {
    rows.push(
      <Row key="sent" tone="good" icon={Check}>
        Sent {s.sent.count === 1 ? "an entry" : `${s.sent.count} entries`} to your PC.
      </Row>,
    );
  }
  if (rows.length === 0) return null;
  return (
    <div role="status" aria-live="polite" className="mb-4 space-y-2">
      {rows}
    </div>
  );
}
