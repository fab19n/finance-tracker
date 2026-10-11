"use client";

import { Check, CloudOff, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, type ComponentType, type ReactNode } from "react";
import { offlineStore } from "@/lib/offline/browser";
import { failed, pending } from "@/lib/offline/offline-store";
import { useOfflineState, when } from "./hooks";

const TONES = { warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", good: "bg-accent-soft text-accent" } as const;

function Row({ tone, icon: Icon, children }: { tone: keyof typeof TONES; icon: ComponentType<{ size?: number; className?: string }>; children: ReactNode }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${TONES[tone]}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
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
      <Row key="failed" tone="danger" icon={TriangleAlert}>
        {entries(bad)} couldn&apos;t be saved on your PC.{" "}
        <Link href="/#waiting" className="font-semibold underline">
          Review
        </Link>
      </Row>,
    );
  }
  if (s.needsLogin && waiting > 0) {
    rows.push(
      <Row key="login" tone="warn" icon={TriangleAlert}>
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
  if (s.connection === "offline") {
    rows.push(
      <Row key="offline" tone="warn" icon={CloudOff}>
        <strong>Can&apos;t reach your PC.</strong>{" "}
        {s.savedCopyAt ? `This page is the copy saved ${when(s.savedCopyAt)}. ` : s.lastOnlineAt ? `It was last reachable ${when(s.lastOnlineAt)}. ` : ""}
        {waiting > 0
          ? `${entries(waiting)} ${waiting === 1 ? "is" : "are"} waiting to be sent. `
          : "Entries you add are kept on this phone and sent when it's back. "}
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
