"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { updateBalance } from "@/app/actions/balance";
import { DuoIcon } from "@/components/DuoIcon";
import { unusualAbove, type BalanceUpdateResult } from "@/lib/balance-update";
import { formatRM } from "@/lib/money";
import { isUnreachable, UNREACHABLE_MESSAGE } from "@/lib/offline/unreachable";

const TONE = { error: "banner-danger", match: "banner-info", lower: "banner-warn", recorded: "banner-good" } as const;

/**
 * "Update balance" on an account's page, for interest that arrives a little every day: type what the bank shows, see the
 * difference, then record it as one interest entry. It submits through onSubmit (like ActionForm) so what was typed is
 * never cleared; changing either box drops the old answer, so Record only ever sits beside the figures it was for.
 */
export function UpdateBalance({ accountId, today }: { accountId: number; today: string }) {
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(today);
  const [result, setResult] = useState<BalanceUpdateResult | null>(null);
  const [trusted, setTrusted] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [pending, startTransition] = useTransition();
  const [, setCrash] = useState(0);
  const asking = result?.kind === "confirm" ? result : null;

  const edit = (set: (v: string) => void) => (value: string) => {
    set(value);
    setResult(null);
    setTrusted(false);
    setUnreachable(false);
  };

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setUnreachable(false);
    startTransition(async () => {
      try {
        const next = await updateBalance({ accountId, balance, date, confirm: asking?.interest, trusted });
        setResult(next);
        if (next.kind === "recorded") {
          setBalance("");
          setTrusted(false);
        }
      } catch (error) {
        if (isUnreachable(error)) setUnreachable(true);
        else
          setCrash(() => {
            throw error; // to the error boundary
          });
      }
    });
  }

  return (
    <details className="card !p-0">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="disc">
          <DuoIcon name="refresh" size={20} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-extrabold">Update balance</span>
          <span className="sub block">Add interest from the balance your bank shows</span>
        </span>
      </summary>
      <form onSubmit={onSubmit} aria-busy={pending || undefined} className="space-y-3 border-t border-line p-3">
        <div className="grid grid-cols-2 gap-2.5">
          <label>
            <span className="label">Bank shows (RM)</span>
            <input className="input" inputMode="decimal" autoComplete="off" required placeholder="e.g. 2006.58" value={balance} onChange={(e) => edit(setBalance)(e.target.value)} />
          </label>
          <label>
            <span className="label">On</span>
            <input className="input" type="date" required max={today} value={date} onChange={(e) => edit(setDate)(e.target.value)} />
          </label>
        </div>

        {/* One live region, there from the start, so each new answer is read out. */}
        <div aria-live="polite" className="space-y-2.5 empty:hidden">
          {result && result.kind !== "confirm" && (
            <p className={`banner ${TONE[result.kind]} !text-xs leading-relaxed`}>
              <span>{result.message}</span>
            </p>
          )}
          {asking && (
            <>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-2xl bg-card-subtle p-3 text-[13px] font-bold">
                <dt className="text-muted">The app has</dt>
                <dd className="num text-right">{formatRM(asking.books)}</dd>
                <dt className="text-muted">Your bank shows</dt>
                <dd className="num text-right">{formatRM(asking.shown)}</dd>
                <dt>Interest to record</dt>
                <dd className="num text-right font-black text-good">+{formatRM(asking.interest)}</dd>
              </dl>
              <p className="sub">It will be saved as income under {asking.category}.</p>
              {asking.unusual && (
                <div className="banner banner-warn flex-col !items-start !text-xs leading-relaxed">
                  <span>
                    That is a lot for interest (more than {formatRM(unusualAbove(asking.books))}). If you moved money in and haven&apos;t recorded it, add it as a transfer
                    instead, then check again.
                  </span>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 font-extrabold">
                    <input type="checkbox" checked={trusted} onChange={(e) => setTrusted(e.target.checked)} className="size-5 shrink-0 accent-accent-strong" />
                    It&apos;s all interest
                  </label>
                  {asking.needsTick && !trusted && <b>Tick the box to record it.</b>}
                </div>
              )}
            </>
          )}
          {unreachable && (
            <p role="alert" className="banner banner-danger !text-xs">
              <span>{UNREACHABLE_MESSAGE}</span>
            </p>
          )}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending && <LoaderCircle size={14} strokeWidth={2.5} className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {asking ? `Record ${formatRM(asking.interest)} as interest` : "Check the difference"}
        </button>
      </form>
    </details>
  );
}
