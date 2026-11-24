"use client";

import { Download, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { clearAllDrafts, lastDraft } from "@/lib/import/draft";
import { forgetSavedPages, savePagesForOffline } from "@/lib/offline/browser";
import { pending as pendingEntries, failed as failedEntries } from "@/lib/offline/offline-store";
import { ageLabel, listSavedPages, oldestSave, storageLine, type SavedPage } from "@/lib/offline/phone";
import { askToKeepStorage, deleteSavedCopies, readPhoneFacts, readSavedCopies, readWorkerError, type PhoneFacts } from "@/lib/offline/phone-browser";
import { LockNowForm } from "./LockNowForm";
import { useOfflineState } from "./hooks";

type Facts = { pages: SavedPage[]; phone: PhoneFacts; draft: { fileName: string | null; savedAt: string } | null; workerError: string | null; now: number };

/**
 * "This phone": what the app keeps on THIS device, said plainly, with the means to clear it. It sits in Settings under
 * Appearance & data. It is about the phone you are holding (pages saved to open without the PC, entries not yet sent, an
 * import review you have not finished), none of which is on the PC; the PC's own data is not touched by anything here.
 */
export function ThisPhoneCard({ pinOn = false }: { pinOn?: boolean }) {
  const s = useOfflineState();
  const [facts, setFacts] = useState<Facts | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [copies, phone] = await Promise.all([readSavedCopies(), readPhoneFacts()]);
    let draft: Facts["draft"] = null;
    try {
      draft = lastDraft(localStorage);
    } catch {
      // storage blocked
    }
    setFacts({ pages: listSavedPages(copies), phone, draft: draft ? { fileName: draft.fileName, savedAt: draft.savedAt } : null, workerError: readWorkerError(), now: Date.now() });
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const waiting = pendingEntries(s).length;
  const refused = failedEntries(s).length;
  const oldest = facts ? oldestSave(facts.pages) : null;
  const storage = storageLine(facts?.phone.persisted ?? null);

  return (
    <section className="card space-y-3.5" aria-labelledby="this-phone-h">
      <div>
        <h2 id="this-phone-h" className="h2">
          This phone
        </h2>
        <p className="sub mt-1">What the app keeps on this device so it can open without your PC. Nothing here changes the data on your PC.</p>
      </div>

      {!facts ? (
        <p className="sub">Looking…</p>
      ) : (
        <dl className="divide-y divide-line text-[13px] font-bold [&>div]:py-2.5 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0">
          <div>
            <dt className="text-muted">Opening without your PC</dt>
            <dd>
              {facts.phone.worker === "running"
                ? "Ready."
                : facts.phone.worker === "starting"
                  ? "Getting ready. Open the app once more while your PC is on."
                  : facts.workerError
                    ? `Not available: this phone's browser refused to start it (${facts.workerError}). The app will not open without your PC.`
                    : "Not available here. It needs the app opened from its https:// address; until then it will not open without your PC."}
            </dd>
          </div>
          {!facts.phone.installed && (
            <div>
              <dt className="text-muted">Home screen</dt>
              <dd>Not added yet. In your browser&apos;s menu choose Add to Home Screen (or Install app), so it opens like an app.</dd>
            </div>
          )}
          <div>
            <dt className="text-muted">Saved pages</dt>
            <dd>
              {facts.pages.length === 0 ? (
                "None yet. They are saved when you open the app with your PC on."
              ) : (
                <>
                  {facts.pages.length} saved{oldest ? `, the oldest ${ageLabel(oldest, facts.now)}` : ""}.
                  <details className="mt-1">
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-xs font-extrabold text-accent-strong [&::-webkit-details-marker]:hidden">Which pages</summary>
                    <ul className="space-y-1 text-xs font-semibold text-muted">
                      {facts.pages.map((p) => (
                        <li key={p.key}>
                          {p.name}
                          {p.savedAt ? `, saved ${ageLabel(p.savedAt, facts.now)}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Entries not sent yet</dt>
            <dd>{waiting + refused === 0 ? "None." : `${waiting} waiting for your PC${refused > 0 ? `, ${refused} it refused` : ""}. They stay here until sent or discarded.`}</dd>
          </div>
          <div>
            <dt className="text-muted">Unfinished import review</dt>
            <dd>
              {facts.draft ? (
                <>
                  {facts.draft.fileName ?? "A pasted statement"}, saved {ageLabel(new Date(facts.draft.savedAt).getTime(), facts.now)}.{" "}
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center font-extrabold text-danger underline"
                    onClick={() => {
                      try {
                        clearAllDrafts(localStorage);
                      } catch {
                        // storage blocked
                      }
                      setNote("The unfinished review was discarded.");
                      void load();
                    }}
                  >
                    Discard it
                  </button>
                </>
              ) : (
                "None."
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Storage</dt>
            <dd>
              {storage.text}{" "}
              {storage.canAsk && (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center font-extrabold text-accent-strong underline"
                  onClick={async () => {
                    const ok = await askToKeepStorage();
                    setNote(ok ? "This phone will keep it." : "This phone didn't agree. Keep the app installed on the Home Screen and used, and it is more likely to.");
                    void load();
                  }}
                >
                  Ask it to keep this
                </button>
              )}
            </dd>
          </div>
        </dl>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await savePagesForOffline(true);
            setNote("Saving your pages now. This takes a few seconds, and only works while your PC is reachable.");
            setTimeout(() => void load(), 4000);
          }}
        >
          <Download size={16} aria-hidden /> Save pages now
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            forgetSavedPages();
            void deleteSavedCopies().then(() => {
              setNote("Saved pages were removed from this phone. They come back the next time you open the app with your PC on.");
              return load();
            });
          }}
        >
          <ConfirmSubmit
            trigger={
              <>
                <Trash2 size={16} aria-hidden /> Forget saved pages
              </>
            }
            triggerClassName="btn"
            title="Forget the saved pages?"
            body="Removes the copies of your pages kept on this phone. The app will not open without your PC until they are saved again. Entries not yet sent and your data on the PC are not touched."
            confirmLabel="Forget them"
            tone="neutral"
          />
        </form>
      </div>
      <p role="status" className="text-xs font-bold text-muted empty:hidden">
        {note}
      </p>

      <div>
        {pinOn && <LockNowForm />}
      </div>
    </section>
  );
}
