"use client";

import { AlertTriangle, CheckCircle2, FileUp, Loader2, Lock, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { commitImport, previewStatement } from "@/app/actions/import";
import type { CommitResult, PreviewOk, PreviewResult } from "@/lib/import/api-types";
import type { ClassifiedRow, ProposalKind } from "@/lib/import/classify";
import { dayLabel } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { ColumnMapper } from "./ColumnMapper";

type Account = { id: number; name: string; type: string; purpose: string | null };
type Category = { id: number; name: string; type: "income" | "expense"; icon: string };
type Bill = { id: number; name: string };

type EditRow = ClassifiedRow & {
  kind: ProposalKind;
  categoryId: number | null;
  item: string;
  billId: number | null;
  transferAccountId: number | null;
  remember: boolean;
  /** The user touched this row, so changes to similar rows no longer overwrite it. */
  edited: boolean;
};

type Filter = "attention" | "all" | "skipped";
const PAGE = 60;

const KIND_LABEL: Record<ProposalKind, string> = { expense: "Spending", income: "Income", transfer: "Transfer", skip: "Skip" };

function toEdit(r: ClassifiedRow): EditRow {
  const p = r.proposal;
  return { ...r, kind: p.kind, categoryId: p.categoryId, item: p.item, billId: p.billId, transferAccountId: p.transferAccountId, remember: false, edited: false };
}

export function ImportWizard({ accounts, categories, bills }: { accounts: Account[]; categories: Category[]; bills: Bill[] }) {
  const statementAccounts = accounts.filter((a) => a.type !== "investment");
  const [accountId, setAccountId] = useState<number>((statementAccounts.find((a) => a.purpose === "spending") ?? statementAccounts[0])?.id ?? 0);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [password, setPassword] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<{ sample: string[][] } | null>(null);
  const [preview, setPreview] = useState<PreviewOk | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [filter, setFilter] = useState<Filter>("attention");
  const [shown, setShown] = useState(PAGE);
  const [setOpening, setSetOpening] = useState(true);
  const [ack, setAck] = useState(false);
  const [result, setResult] = useState<Extract<CommitResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();

  const account = accounts.find((a) => a.id === accountId);

  async function read(overrides?: object) {
    setError(null);
    setMapping(null);
    const fd = new FormData();
    fd.set("accountId", String(accountId));
    if (file) fd.set("file", file);
    if (text.trim()) fd.set("text", text);
    if (password) fd.set("password", password);
    if (overrides) fd.set("overrides", JSON.stringify(overrides));
    start(async () => {
      const res: PreviewResult = await previewStatement(fd);
      if (!res.ok) {
        setError(res.error);
        setNeedPassword(!!res.needPassword);
        if (res.mapping) setMapping(res.mapping);
        return;
      }
      setNeedPassword(false);
      setPreview(res);
      setRows(res.rows.map(toEdit));
      setFilter(res.stats.needsReview > 0 || res.check.mismatches.length > 0 ? "attention" : "all");
      setShown(PAGE);
      setSetOpening(res.account.existingEntries === 0 && res.openingBalance !== null);
      setAck(false);
    });
  }

  const catsFor = (kind: ProposalKind) => categories.filter((c) => c.type === (kind === "income" ? "income" : "expense"));

  function patch(key: string, change: Partial<EditRow>) {
    setRows((all) => {
      const target = all.find((r) => r.key === key);
      if (!target) return all;
      const merged: EditRow = { ...target, ...change, edited: true, remember: change.remember ?? true };
      if (change.kind === "transfer") merged.billId = null;
      // Carry the decision to the other untouched lines from the same payee going the same way, so one
      // correction fixes them all ("Starbucks" -> Eating Out, everywhere).
      const carried = Object.fromEntries((["kind", "categoryId", "transferAccountId", "item"] as const).filter((k) => k in change).map((k) => [k, merged[k]])) as Partial<EditRow>;
      return all.map((r) => {
        if (r.key === key) return merged;
        const alike = r.group === target.group && !r.edited && r.proposal.source !== "duplicate" && r.kind !== "skip" && r.amount < 0 === target.amount < 0;
        return alike ? { ...r, ...carried } : r;
      });
    });
  }

  const problems = useMemo(() => {
    const bad = new Set<string>();
    for (const r of rows) {
      if (r.kind === "skip") continue;
      if ((r.kind === "expense" || r.kind === "income") && !r.categoryId) bad.add(r.key);
      if (r.kind === "transfer" && !r.transferAccountId) bad.add(r.key);
    }
    return bad;
  }, [rows]);

  const mismatch = useMemo(() => new Set(preview?.check.mismatches ?? []), [preview]);
  const needsLook = (r: EditRow) => r.kind !== "skip" && (problems.has(r.key) || mismatch.has(r.index) || (!r.edited && r.proposal.confidence === "low") || r.signedBy === "guess");
  const visible = rows.filter((r) => (filter === "all" ? true : filter === "skipped" ? r.kind === "skip" : needsLook(r)));
  const toImport = rows.filter((r) => r.kind !== "skip");

  function save() {
    if (!preview) return;
    start(async () => {
      const res = await commitImport({
        accountId,
        setOpeningBalance: setOpening && preview.openingBalance !== null ? preview.openingBalance : null,
        rows: rows.map((r) => ({
          key: r.key,
          date: r.date,
          amount: r.amount,
          description: r.description,
          kind: r.kind,
          categoryId: r.kind === "transfer" || r.kind === "skip" ? null : r.categoryId,
          item: r.item,
          billId: r.kind === "expense" ? r.billId : null,
          transferAccountId: r.kind === "transfer" ? r.transferAccountId : null,
          remember: r.remember && r.kind !== "skip",
        })),
      });
      if (res.ok) setResult(res);
      else setError(res.error);
    });
  }

  // ---------------------------------------------------------------- done
  if (result) {
    return (
      <div className="card space-y-3">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <CheckCircle2 className="text-accent" aria-hidden /> Imported {result.imported} entries
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {result.transfers > 0 && <li>{result.transfers} of them are transfers (not counted as spending)</li>}
          {result.skipped > 0 && <li>{result.skipped} lines were skipped (already recorded, or skipped by you)</li>}
          {result.rulesSaved > 0 && <li>Remembered {result.rulesSaved} rule{result.rulesSaved === 1 ? "" : "s"}, so similar lines are sorted automatically next time</li>}
          {result.openingSet && <li>Set {account?.name}&apos;s starting balance so the app matches your bank</li>}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Link href="/plan" className="btn-primary !py-2.5 text-sm">
            See your plan
          </Link>
          <Link href="/transactions?month=all" className="btn">
            View activity
          </Link>
          <button className="btn" onClick={() => { setResult(null); setPreview(null); setRows([]); setFile(null); setText(""); setPassword(""); }}>
            Import another statement
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- upload
  if (!preview) {
    return (
      <div className="space-y-4">
        <form
          className="card space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void read();
          }}
        >
          <div>
            <label className="label" htmlFor="imp-account">
              Which account is this statement for?
            </label>
            <select id="imp-account" className="input" value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
              {statementAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.purpose ? ` (${a.purpose})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="imp-file">
              Statement file (PDF or CSV)
            </label>
            <input id="imp-file" type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <Lock size={12} aria-hidden /> Read on this computer only. Nothing is uploaded anywhere.
            </p>
          </div>

          {needPassword && (
            <div>
              <label className="label" htmlFor="imp-pw">
                This PDF is password-protected
              </label>
              <input id="imp-pw" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="PDF password (not saved)" className="input" />
            </div>
          )}

          <details>
            <summary className="cursor-pointer text-sm font-medium text-accent">Or paste the statement text instead</summary>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Select all in your PDF viewer, copy, and paste here…" className="input mt-2 font-mono text-xs" />
          </details>

          {error && (
            <p role="alert" className="flex gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}
            </p>
          )}

          <button className="btn-primary w-full md:w-auto" disabled={pending || (!file && !text.trim())}>
            {pending ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} aria-hidden />} Read statement
          </button>
        </form>

        {mapping && (
          <div className="card space-y-3">
            <h2 className="font-semibold">Tell me which column is which</h2>
            <ColumnMapper sample={mapping.sample} busy={pending} onApply={(o) => void read(o)} />
          </div>
        )}

        <aside className="rounded-2xl border border-line bg-background p-4 text-xs text-muted">
          <p className="mb-1 font-semibold text-foreground">Where to get the file</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Download the monthly <strong>PDF e-statement</strong> from your bank&apos;s website or app (Maybank2u: statements; CIMB Clicks: Services → View e-Statement).</li>
            <li>Bank PDFs are often password-protected. Enter the password when asked; it is used once and never stored.</li>
            <li>Import a few months, oldest first. The app checks every line against the bank&apos;s own running balance, so a misread can&apos;t slip through quietly.</li>
          </ul>
        </aside>
      </div>
    );
  }

  // ---------------------------------------------------------------- review
  const { check, stats } = preview;
  const allGood = check.mismatches.length === 0 && check.checked > 0;
  return (
    <div className="space-y-4">
      <section className="card space-y-3" aria-label="Summary">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">
            {preview.account.name}: {stats.total} lines
            {preview.dateRange && (
              <span className="font-normal text-muted">
                {" "}
                · {dayLabel(preview.dateRange.from)} to {dayLabel(preview.dateRange.to)}
              </span>
            )}
          </p>
          <button className="text-sm font-medium text-accent" onClick={() => { setPreview(null); setRows([]); }}>
            ← Choose a different file
          </button>
        </div>

        <p className={`flex gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ${allGood ? "bg-accent-soft text-accent" : check.mismatches.length ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
          {allGood ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />}
          <span>
            {allGood
              ? `Every line adds up to the bank's running balance (${check.matched} of ${check.checked} checked).`
              : check.checked === 0
                ? "This statement has no running balance to check against, so please look over the amounts and directions yourself."
                : `${check.mismatches.length} line${check.mismatches.length === 1 ? "" : "s"} don't add up to the bank's running balance - they're marked below.`}
          </span>
        </p>
        {preview.warnings.filter((w) => !/add up/.test(w)).map((w) => (
          <p key={w} className="text-xs text-warn">
            {w}
          </p>
        ))}

        <p className="text-sm text-muted">
          <strong className="text-foreground">{stats.fresh}</strong> new
          {stats.duplicates > 0 && <> · {stats.duplicates} already recorded (skipped)</>}
          {stats.needsReview > 0 && <> · <strong className="text-warn">{stats.needsReview}</strong> need a look</>}
        </p>

        {preview.openingBalance !== null && preview.account.existingEntries === 0 && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={setOpening} onChange={(e) => setSetOpening(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />
            <span>
              Set {preview.account.name}&apos;s starting balance to <strong>{formatRM(preview.openingBalance)}</strong> (the balance before the first line), so the app matches your bank.
              {!check.openingVerified && <span className="text-warn"> The statement didn&apos;t state it, so this is worked out from the first line - check it against your statement.</span>}
            </span>
          </label>
        )}
      </section>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter lines">
        {([
          ["attention", `Needs a look (${rows.filter(needsLook).length})`],
          ["all", `All (${rows.length})`],
          ["skipped", `Skipped (${rows.filter((r) => r.kind === "skip").length})`],
        ] as const).map(([f, label]) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => { setFilter(f); setShown(PAGE); }} className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${filter === f ? "border-accent bg-accent-soft text-accent" : "border-line"}`}>
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="card text-sm text-muted">{filter === "attention" ? "Nothing needs a look. Switch to “All” to review everything." : "Nothing here."}</p>
      ) : (
        <ul className="space-y-2">
          {visible.slice(0, shown).map((r) => (
            <li key={r.key} className={`card !p-3 ${mismatch.has(r.index) ? "border-danger/60" : problems.has(r.key) ? "border-warn/60" : ""} ${r.kind === "skip" ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.description}</p>
                  <p className="text-xs text-muted">{dayLabel(r.date)}</p>
                </div>
                <p className={`num shrink-0 font-semibold ${r.amount > 0 ? "text-income" : ""}`}>
                  {r.amount > 0 ? "+" : "−"}
                  {formatRM(Math.abs(r.amount))}
                </p>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                <select aria-label="What is this?" className="input !py-2 text-sm" value={r.kind} onChange={(e) => patch(r.key, { kind: e.target.value as ProposalKind, categoryId: null })}>
                  {(Object.keys(KIND_LABEL) as ProposalKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                {r.kind === "transfer" ? (
                  <select aria-label="Other account" className="input !py-2 text-sm md:col-span-2" value={r.transferAccountId ?? ""} onChange={(e) => patch(r.key, { transferAccountId: Number(e.target.value) || null })}>
                    <option value="">{r.amount < 0 ? "Went to which account?" : "Came from which account?"}</option>
                    {accounts.filter((a) => a.id !== accountId).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                ) : r.kind !== "skip" ? (
                  <select aria-label="Category" className="input !py-2 text-sm md:col-span-2" value={r.categoryId ?? ""} onChange={(e) => patch(r.key, { categoryId: Number(e.target.value) || null })}>
                    <option value="">Choose a category…</option>
                    {catsFor(r.kind).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="col-span-2 self-center text-xs text-muted md:col-span-2">{r.proposal.reason}</p>
                )}
                {r.kind !== "skip" && <input aria-label="Item" className="input !py-2 text-sm" value={r.item} onChange={(e) => patch(r.key, { item: e.target.value })} placeholder="Item" />}
              </div>

              {r.kind !== "skip" && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {r.billId && (
                    <span className="pill bg-accent-soft text-accent">
                      Bill: {bills.find((b) => b.id === r.billId)?.name}
                      <button type="button" aria-label="Unlink from bill" className="ml-1" onClick={() => patch(r.key, { billId: null, remember: r.remember })}>
                        <X size={12} />
                      </button>
                    </span>
                  )}
                  <span className={r.proposal.confidence === "low" && !r.edited ? "font-medium text-warn" : "text-muted"}>{r.edited ? "Your choice" : r.proposal.reason}</span>
                  {r.signedBy === "guess" && <span className="font-medium text-warn">Direction guessed: check it</span>}
                  {mismatch.has(r.index) && <span className="font-medium text-danger">Doesn&apos;t add up to the running balance</span>}
                  {problems.has(r.key) && <span className="font-medium text-warn">{r.kind === "transfer" ? "Pick the other account" : "Pick a category"}</span>}
                  {r.edited && (
                    <label className="ml-auto flex items-center gap-1.5 text-muted">
                      <input type="checkbox" checked={r.remember} onChange={(e) => setRows((all) => all.map((x) => (x.key === r.key ? { ...x, remember: e.target.checked } : x)))} className="size-3.5 accent-[var(--accent)]" />
                      Remember for next time
                    </label>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {visible.length > shown && (
        <button className="btn w-full" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, visible.length - shown)} more
        </button>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="sticky bottom-20 z-10 space-y-2 rounded-2xl border border-line bg-card/95 p-3 shadow-lg backdrop-blur md:bottom-4">
        {problems.size > 0 && <p className="text-sm font-medium text-warn">{problems.size} line{problems.size === 1 ? " needs" : "s need"} a category or account before you can import.</p>}
        {check.mismatches.length > 0 && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />I&apos;ve checked the lines marked red and want to import anyway.
          </label>
        )}
        <button className="btn-primary w-full" onClick={save} disabled={pending || problems.size > 0 || toImport.length === 0 || (check.mismatches.length > 0 && !ack)}>
          {pending && <Loader2 size={18} className="animate-spin" />} Import {toImport.length} {toImport.length === 1 ? "entry" : "entries"}
        </button>
      </div>
    </div>
  );
}
