"use client";

import { Pencil, RotateCw, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { shortDate } from "@/lib/dates";
import { initials } from "@/lib/initials";
import { formatRM } from "@/lib/money";
import { offlineStore } from "@/lib/offline/browser";
import { failed } from "@/lib/offline/offline-store";
import type { OutboxEntry } from "@/lib/offline/types";
import { useOfflineState } from "./hooks";

function Item({ item, busy, editing }: { item: OutboxEntry; busy: boolean; editing: boolean }) {
  const store = offlineStore();
  const [sure, setSure] = useState(false);
  const { entry, labels } = item;
  const id = entry.clientId;
  const isFailed = item.status === "failed";
  const title = entry.item || (entry.type === "transfer" ? "Transfer" : labels.category) || "Entry";
  const where = entry.type === "transfer" ? `${labels.account} to ${labels.toAccount ?? "another account"}` : [labels.category, labels.account].filter(Boolean).join(" · ");
  const sign = entry.type === "income" ? "+" : entry.type === "expense" ? "-" : "";

  return (
    <li className="space-y-2 rounded-2xl bg-card-subtle p-3">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="grid size-[34px] shrink-0 place-items-center rounded-xl bg-card text-xs font-black">
          {entry.type === "transfer" ? "⇄" : initials(labels.category)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-extrabold">{title}</p>
          <p className="truncate text-[11px] font-bold text-muted">
            {where} · {shortDate(entry.date)}
          </p>
        </div>
        <p className={`num shrink-0 text-[13px] font-black ${entry.type === "income" ? "text-good" : ""}`}>
          {sign}
          {formatRM(entry.amount)}
        </p>
      </div>

      {isFailed ? (
        <p role="alert" className="flex items-start gap-1.5 text-xs font-extrabold text-danger">
          <TriangleAlert size={14} aria-hidden className="mt-px shrink-0" />
          Your PC didn&apos;t accept this: {item.error}
        </p>
      ) : (
        <p className="text-xs font-bold text-muted">Saved on this phone. Waiting for your PC.</p>
      )}
      {editing && <p className="text-xs font-extrabold text-accent-strong">Being corrected in the form above.</p>}

      <div className="flex flex-wrap gap-2">
        {isFailed && (
          <button type="button" className="btn !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => void store.retry(id)}>
            <RotateCw size={14} aria-hidden /> Retry
          </button>
        )}
        <button
          type="button"
          className="btn !px-3 !py-1.5 text-xs"
          disabled={busy || editing}
          onClick={() => {
            store.startEdit(id);
            document.getElementById("add-entry")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          <Pencil size={14} aria-hidden /> {isFailed ? "Edit and retry" : "Edit"}
        </button>
        <button
          type="button"
          className={`btn-danger !px-3 !py-1.5 text-xs ${sure ? "bg-danger-soft" : ""}`}
          disabled={busy}
          onBlur={() => setSure(false)}
          onClick={() => (sure ? void store.discard(id) : setSure(true))}
        >
          <Trash2 size={14} aria-hidden /> {sure ? "Tap again to discard" : "Discard"}
        </button>
      </div>
    </li>
  );
}

/**
 * Entries typed on this phone that the PC doesn't have yet: the ones waiting for it to be reachable, and the ones it refused
 * (which stay here, with its reason, until you retry them, correct and retry them, or throw them away).
 */
export function OutboxList() {
  const s = useOfflineState();
  if (s.entries.length === 0) return null;
  const bad = failed(s).length;
  return (
    <section id="waiting" className="card scroll-mt-6 space-y-3" aria-labelledby="waiting-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="waiting-h" className="h2">
          Waiting to send
        </h2>
        {bad > 1 && (
          <button type="button" className="btn !px-3 !py-1.5" disabled={s.syncing} onClick={() => void offlineStore().retryAll()}>
            <RotateCw size={14} aria-hidden /> Retry all
          </button>
        )}
      </div>
      <p className="sub">Kept safely on this phone. The balances and totals on screen don&apos;t include them yet.</p>
      <ul className="space-y-2">
        {s.entries.map((item) => (
          <Item key={item.entry.clientId} item={item} busy={s.syncing} editing={s.editingId === item.entry.clientId} />
        ))}
      </ul>
    </section>
  );
}
