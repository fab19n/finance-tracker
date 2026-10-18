"use client";

import { AlertTriangle, Check, CheckCircle2, ChevronLeft, FileText, FileUp, Loader2, Lock, Upload, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { commitImport, previewStatement } from "@/app/actions/import";
import { PageHeader } from "@/components/PageHeader";
import type { CommitResult, PreviewOk, PreviewResult } from "@/lib/import/api-types";
import type { ClassifiedRow, ProposalKind } from "@/lib/import/classify";
import { dayLabel } from "@/lib/dates";
import { formatRM } from "@/lib/money";
import { ColumnMapper } from "./ColumnMapper";

type Account = { id: number; name: string; type: string; purpose: string | null };
type Category = { id: number; name: string; type: "income" | "expense"; icon: string };
type Bill = { id: number; name: string };
type Share = { id: number; label: string };

type EditRow = ClassifiedRow & {
  kind: ProposalKind;
  categoryId: number | null;
  item: string;
  billId: number | null;
  /** Money in from someone who shares one of your bills. */
  shareId: number | null;
  transferAccountId: number | null;
  remember: boolean;
  /** The user touched this row, so changes to similar rows no longer overwrite it. */
  edited: boolean;
};

type Filter = "attention" | "all" | "skipped";
const PAGE = 60;

const KIND_LABEL: Record<ProposalKind, string> = { expense: "Spending", income: "Income", transfer: "Transfer", skip: "Skip" };

/**
 * What a pill or banner colour means here. good = matched / adds up; warn = needs a look; danger = doesn't add up;
 * accent = something you did (your choice, a link you made). Every one also carries words (and an icon), never colour alone.
 */
type Tone = "good" | "warn" | "danger" | "accent";
const PILL: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent-soft text-accent-strong",
};
const BANNER = { good: "banner banner-good", warn: "banner banner-warn", danger: "banner banner-danger" } as const;

/** A status pill that may run to two lines (the reasons are whole sentences); it is still a full pill when it fits on one. */
function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`pill min-w-0 max-w-full shrink items-start whitespace-normal rounded-2xl text-left leading-snug ${PILL[tone]}`}>
      {tone === "good" ? (
        <Check size={12} strokeWidth={3} className="mt-px shrink-0" aria-hidden />
      ) : tone === "accent" ? null : (
        <AlertTriangle size={12} className="mt-px shrink-0" aria-hidden />
      )}
      <span className="min-w-0">{children}</span>
    </span>
  );
}

function toEdit(r: ClassifiedRow): EditRow {
  const p = r.proposal;
  return { ...r, kind: p.kind, categoryId: p.categoryId, item: p.item, billId: p.billId, shareId: p.shareId, transferAccountId: p.transferAccountId, remember: false, edited: false };
}

export function ImportWizard({ accounts, categories, bills, shares }: { accounts: Account[]; categories: Category[]; bills: Bill[]; shares: Share[] }) {
  const statementAccounts = accounts.filter((a) => a.type !== "investment");
  const [accountId, setAccountId] = useState<number>((statementAccounts.find((a) => a.purpose === "spending") ?? statementAccounts[0])?.id ?? 0);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [password, setPassword] = useState("");
  // Kept between statements: every file in a batch should start from the same day.
  const [startDate, setStartDate] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<{ sample: string[][] } | null>(null);
  const [preview, setPreview] = useState<PreviewOk | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [filter, setFilter] = useState<Filter>("attention");
  const [shown, setShown] = useState(PAGE);
  const [setOpening, setSetOpening] = useState(true);
  const [ack, setAck] = useState(false);
  const [ackAccount, setAckAccount] = useState(false);
  const [result, setResult] = useState<Extract<CommitResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();

  const account = accounts.find((a) => a.id === accountId);

  async function read(overrides?: object, asAccount?: number) {
    setError(null);
    setMapping(null);
    const forAccount = asAccount ?? accountId;
    if (asAccount) setAccountId(asAccount);
    const fd = new FormData();
    fd.set("accountId", String(forAccount));
    if (file) fd.set("file", file);
    if (text.trim()) fd.set("text", text);
    if (password) fd.set("password", password);
    if (startDate) fd.set("startDate", startDate);
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
      setAckAccount(false);
    });
  }

  const catsFor = (kind: ProposalKind) => categories.filter((c) => c.type === (kind === "income" ? "income" : "expense"));

  function patch(key: string, change: Partial<EditRow>) {
    setRows((all) => {
      const target = all.find((r) => r.key === key);
      if (!target) return all;
      const merged: EditRow = { ...target, ...change, edited: true, remember: change.remember ?? true };
      if (change.kind === "transfer") merged.billId = null;
      if (change.kind && change.kind !== "income") merged.shareId = null; // a share payment is money in, nothing else
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
          shareId: r.kind === "income" ? r.shareId : null,
          transferAccountId: r.kind === "transfer" ? r.transferAccountId : null,
          remember: r.remember && r.kind !== "skip",
        })),
      });
      if (res.ok) setResult(res);
      else setError(res.error);
    });
  }

  /**
   * The page around every phase: the one <h1> (with the step in its subtitle, so it can follow the wizard) and a single
   * column no wider than 720 px. A plain function, not a component, so the phases keep their state when the step changes.
   */
  const page = (subtitle: string, body: ReactNode) => (
    <div className="space-y-4 md:space-y-5">
      <PageHeader
        title="Import statement"
        subtitle={subtitle}
        actions={
          <Link href="/plan" className="btn">
            <ChevronLeft size={14} strokeWidth={2.5} aria-hidden />
            <span className="md:hidden">Plan</span>
            <span className="hidden md:inline">Back to Plan</span>
          </Link>
        }
      />
      <div className="max-w-[45rem] space-y-3 md:space-y-4">{body}</div>
    </div>
  );

  // ---------------------------------------------------------------- done
  if (result) {
    return page(
      "All done",
      <div className="card space-y-3.5">
        <p className="flex items-center gap-2.5 text-lg font-black">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-good-soft text-good">
            <CheckCircle2 size={20} aria-hidden />
          </span>
          Imported {result.imported} entries
        </p>
        <ul className="list-disc space-y-1.5 rounded-2xl bg-card-subtle py-3 pl-8 pr-3.5 text-[13px] font-bold text-muted">
          {result.transfers > 0 && <li>{result.transfers} of them are transfers (not counted as spending)</li>}
          {result.skipped > 0 && <li>{result.skipped} lines were skipped (already recorded, or skipped by you)</li>}
          {result.rulesSaved > 0 && <li>Remembered {result.rulesSaved} rule{result.rulesSaved === 1 ? "" : "s"}, so similar lines are sorted automatically next time</li>}
          {result.openingSet && <li>Set {account?.name}&apos;s starting balance so the app matches your bank</li>}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Link href="/plan" className="btn-primary w-full md:w-auto">
            See your plan
          </Link>
          <Link href="/transactions?month=all" className="btn">
            View activity
          </Link>
          <button className="btn" onClick={() => { setResult(null); setPreview(null); setRows([]); setFile(null); setText(""); setPassword(""); }}>
            Import another statement
          </button>
        </div>
      </div>,
    );
  }

  // ---------------------------------------------------------------- upload
  if (!preview) {
    return page(
      "Step 1 of 2 · choose a statement",
      <>
        <form
          className="card space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void read();
          }}
        >
          <div>
            <h2 className="h2">Bank statement</h2>
            <p className="sub mt-1">
              Bring in past months in minutes instead of typing them. I&apos;ll sort what I recognise (bills, petrol, subscriptions, ATM withdrawals) and ask only about the rest.
            </p>
          </div>

          <div>
            <label className="sr-only" htmlFor="imp-file">
              Statement file (PDF or CSV)
            </label>
            {/* The real file input sits invisibly over the whole zone: a tap opens the picker and a file dropped on it is taken. */}
            <div className="relative rounded-[20px] border-2 border-dashed border-line bg-background px-4 py-7 text-center transition hover:border-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
              <div className="mx-auto mb-2.5 grid size-12 place-items-center rounded-full bg-accent-soft text-accent-strong">
                {file ? <FileText size={22} aria-hidden /> : <Upload size={22} aria-hidden />}
              </div>
              <p className="truncate text-[13px] font-extrabold">{file ? file.name : "Drop the statement here or tap to choose"}</p>
              <p className="sub mt-0.5 !text-[11px]">{file ? "Tap to choose a different file" : "PDF or CSV"}</p>
              <input id="imp-file" type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv" className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-muted">
              <Lock size={12} aria-hidden /> Read on this computer only. Nothing is uploaded anywhere.
            </p>
          </div>

          <div className={`grid gap-3 ${needPassword ? "md:grid-cols-2" : ""}`}>
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

            {needPassword && (
              <div>
                <label className="label" htmlFor="imp-pw">
                  This PDF is password-protected
                </label>
                <input id="imp-pw" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="PDF password (not saved)" className="input" />
              </div>
            )}
          </div>

          <div>
            <label className="label" htmlFor="imp-start">
              Only import lines from this date on <span className="font-semibold">(optional)</span>
            </label>
            <input id="imp-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input md:max-w-xs" />
            <p className="mt-1.5 text-[11px] font-semibold leading-snug text-muted">
              Use the same date for every statement and both banks (say 1 Jan). Banks cut their statements on different days, so without this, transfers between your two accounts get
              counted before the other account&apos;s history begins.
            </p>
          </div>

          <details>
            <summary className="inline-flex min-h-8 cursor-pointer list-none items-center text-xs font-extrabold text-accent-strong [&::-webkit-details-marker]:hidden">
              Or paste the statement text instead
            </summary>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Select all in your PDF viewer, copy, and paste here…" className="input mt-2 font-mono text-xs" />
          </details>

          {error && (
            <p role="alert" className="banner banner-danger leading-snug">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}
            </p>
          )}

          <button className="btn-primary w-full" disabled={pending || (!file && !text.trim())}>
            {pending ? <Loader2 size={16} strokeWidth={3} className="animate-spin" /> : <FileUp size={16} aria-hidden />} Read statement
          </button>
        </form>

        {mapping && (
          <div className="card space-y-3">
            <h2 className="h2">Tell me which column is which</h2>
            <ColumnMapper sample={mapping.sample} busy={pending} onApply={(o) => void read(o)} />
          </div>
        )}

        <div className="card">
          <h2 className="h2 mb-2">How this works</h2>
          <ol className="space-y-1.5 text-xs font-semibold leading-relaxed text-muted">
            <li>1. Lines already in your books are skipped.</li>
            <li>2. Card holds and reversed transfers cancel out.</li>
            <li>3. You review every new line before anything is saved.</li>
          </ol>
        </div>

        <aside className="card">
          <h2 className="h2 mb-2">Where to get the file</h2>
          <ul className="list-disc space-y-1.5 pl-4 text-xs font-semibold leading-relaxed text-muted">
            <li><strong className="font-extrabold text-foreground">Maybank:</strong> the monthly PDF e-statement. <strong className="font-extrabold text-foreground">CIMB:</strong> the e-statement PDF, the Transaction History <strong className="font-extrabold text-foreground">CSV</strong>, or the Transaction History page printed to PDF for a month.</li>
            <li><strong className="font-extrabold text-foreground">Touch &lsquo;n Go eWallet:</strong> the &ldquo;TNG WALLET TRANSACTION HISTORY&rdquo; PDF the app e-mails you. Choose your e-Wallet account. Your top-ups from the bank are recognised as already recorded; what you spent and what you earned on GO+ is added.</li>
            <li>Bank PDFs are often password-protected. Enter the password when asked; it is used once and never stored.</li>
            <li>Import oldest first, and your <strong className="font-extrabold text-foreground">spending account before your savings account</strong>, so transfers between them are recognised once. Import your banks before an e-wallet&apos;s history for the same reason. Tick &ldquo;set the starting balance&rdquo; only on the earliest statement of each account.</li>
            <li>The app checks every line against the bank&apos;s own running balance, so a misread can&apos;t slip through quietly. (A wallet history prints no running balance, so the whole statement is checked against its closing balance instead.)</li>
          </ul>
        </aside>
      </>,
    );
  }

  // ---------------------------------------------------------------- review
  const { check, stats } = preview;
  // A statement with no running balance (a wallet history) is checked as a whole: where it started + its lines = where it ended.
  const total = check.total;
  const allGood = total ? total.ok : check.mismatches.length === 0 && check.checked > 0;
  const balanceTone: Exclude<Tone, "accent"> = allGood ? "good" : check.mismatches.length ? "danger" : "warn";
  const balanceWord = allGood
    ? "Balance matches"
    : check.mismatches.length
      ? `${check.mismatches.length} line${check.mismatches.length === 1 ? "" : "s"} off`
      : total
        ? "Closing balance off"
        : "No balance to check";
  const balanceMessage = total
    ? total.ok
      ? `These lines take the account from ${formatRM(total.opening)} to ${formatRM(total.closing)}, exactly where the statement says it ended.`
      : "These lines don't reach the statement's closing balance - see below."
    : allGood
      ? `Every line adds up to the bank's running balance (${check.matched} of ${check.checked} checked).`
      : check.checked === 0
        ? "This statement has no running balance to check against, so please look over the amounts and directions yourself."
        : `${check.mismatches.length} line${check.mismatches.length === 1 ? "" : "s"} don't add up to the bank's running balance - they're marked below.`;

  return page(
    `Step 2 of 2 · review ${stats.fresh} new ${stats.fresh === 1 ? "line" : "lines"}`,
    <>
      <section className="card space-y-3" aria-label="Summary">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <p className="text-[13px] font-black">{preview.account.name}</p>
            <p className="sub !text-[11px]">
              {stats.total} lines
              {preview.dateRange && (
                <>
                  {" "}
                  · {dayLabel(preview.dateRange.from)} to {dayLabel(preview.dateRange.to)}
                </>
              )}
            </p>
            <button type="button" className="mt-1 inline-flex min-h-8 items-center text-xs font-extrabold text-accent-strong" onClick={() => { setPreview(null); setRows([]); }}>
              ← Choose a different file
            </button>
          </div>
          <span className={`pill ${PILL[balanceTone]}`}>
            {allGood ? <Check size={12} strokeWidth={3} aria-hidden /> : <AlertTriangle size={12} aria-hidden />}
            {balanceWord}
          </span>
        </div>

        {allGood ? (
          <p className="sub !text-xs">{balanceMessage}</p>
        ) : (
          <p className={BANNER[balanceTone]}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>{balanceMessage}</span>
          </p>
        )}
        {preview.warnings.filter((w) => !/add up/.test(w)).map((w) => (
          <p key={w} className="banner banner-warn !text-xs">
            <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden />
            <span>{w}</span>
          </p>
        ))}

        {preview.accountCheck && (
          <div role="alert" className={`${BANNER[preview.accountCheck.looksLike ? "danger" : "warn"]} flex-col items-stretch gap-1`}>
            <p className="flex gap-2 font-black">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              {preview.accountCheck.looksLike
                ? `This looks like ${preview.accountCheck.looksLike.name}'s statement, not ${preview.account.name}'s`
                : `This statement doesn't start where your books for ${preview.account.name} leave off`}
            </p>
            <p className="text-xs font-semibold leading-snug">
              On {dayLabel(preview.accountCheck.date)} the statement starts at <strong className="font-black">{formatRM(preview.accountCheck.statement)}</strong>, but your entries say {preview.account.name} held{" "}
              <strong className="font-black">{formatRM(preview.accountCheck.books)}</strong>
              {preview.accountCheck.looksLike
                ? `, while ${preview.accountCheck.looksLike.name} should hold exactly the statement's figure. Importing it here would file ${preview.accountCheck.looksLike.name}'s transactions under ${preview.account.name}.`
                : ` (a difference of ${formatRM(Math.abs(preview.accountCheck.statement - preview.accountCheck.books))}). Either it belongs to a different account, or entries before this date are missing or wrong (a transfer to an account the app doesn't track, for example).`}
            </p>
            {preview.accountCheck.looksLike && (
              <button type="button" className="btn-primary mt-1.5 self-start" disabled={pending} onClick={() => read(undefined, preview.accountCheck!.looksLike!.id)}>
                Read it as {preview.accountCheck.looksLike.name} instead
              </button>
            )}
          </div>
        )}

        {preview.oneSided.length > 0 && (
          <div className={`${BANNER.warn} flex-col items-stretch gap-1`}>
            <p className="flex gap-2 font-black">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              {preview.oneSided.length} transfer{preview.oneSided.length === 1 ? "" : "s"} between your accounts {preview.oneSided.length === 1 ? "has" : "have"} no matching line on the other side
            </p>
            <p className="text-xs font-semibold leading-snug">
              A transfer should appear on both accounts&apos; statements. These didn&apos;t, so the money probably went to (or came from) an account this app doesn&apos;t track. If so, add that account in Settings and
              edit these transfers; otherwise the two balances will drift apart by these amounts.
            </p>
            <ul className="mt-0.5 space-y-1 text-xs font-semibold">
              {preview.oneSided.slice(0, 8).map((t, i) => (
                <li key={i}>
                  {dayLabel(t.date)} · <strong className="font-black">{t.amount > 0 ? "+" : "−"}{formatRM(Math.abs(t.amount))}</strong> · {t.note || "transfer"}
                  <span className="text-muted"> ({t.where === "other" ? "from the other account's statement; not on this one" : "on this statement; not on the other account's"})</span>
                </li>
              ))}
              {preview.oneSided.length > 8 && <li>…and {preview.oneSided.length - 8} more</li>}
            </ul>
          </div>
        )}

        {preview.openingBalance !== null && preview.account.existingEntries === 0 && (
          <label className="flex items-start gap-2.5 rounded-2xl bg-card-subtle p-3 text-[13px] font-bold">
            <input type="checkbox" checked={setOpening} onChange={(e) => setSetOpening(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-accent" />
            <span>
              Set {preview.account.name}&apos;s starting balance to <strong className="font-black">{formatRM(preview.openingBalance)}</strong> (the balance before the first line), so the app matches your bank.
              {!check.openingVerified && <span className="text-warn"> The statement didn&apos;t state it, so this is worked out from the first line - check it against your statement.</span>}
            </span>
          </label>
        )}
      </section>

      <p className="px-1 text-xs font-bold leading-relaxed text-muted">
        <strong className="font-black text-foreground">{stats.fresh}</strong> new
        {stats.duplicates > 0 && <> · {stats.duplicates} already recorded (skipped)</>}
        {stats.holds > 0 && <> · {stats.holds} lines that cancel out: card holds and reversed transfers (skipped)</>}
        {preview.leftOut > 0 && <> · {preview.leftOut} earlier lines left out (before {dayLabel(startDate)})</>}
        {stats.needsReview > 0 && <> · <strong className="font-black text-warn">{stats.needsReview}</strong> need a look</>}
      </p>

      <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 pb-0.5 md:mx-0 md:px-0" role="tablist" aria-label="Filter lines">
        {([
          ["attention", `Needs a look (${rows.filter(needsLook).length})`],
          ["all", `All (${rows.length})`],
          ["skipped", `Skipped (${rows.filter((r) => r.kind === "skip").length})`],
        ] as const).map(([f, label]) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => { setFilter(f); setShown(PAGE); }} className="chip">
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card py-10 text-center">
          {filter === "attention" ? (
            <>
              <p className="text-sm font-black">Nothing needs a look.</p>
              <p className="sub mt-1">Switch to “All” to review everything.</p>
            </>
          ) : (
            <p className="text-sm font-black">Nothing here.</p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.slice(0, shown).map((r) => {
            const off = mismatch.has(r.index);
            return (
              <li
                key={r.key}
                className={`card min-w-0 border-[1.5px] px-4 py-3.5 ${off ? "border-danger" : needsLook(r) ? "border-warn" : "border-transparent"} ${r.kind === "skip" ? "opacity-45" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-black">{r.description}</p>
                    <p className="sub !text-[11px]">{dayLabel(r.date)}</p>
                  </div>
                  <p className={`num shrink-0 text-sm font-black ${r.kind === "transfer" || r.kind === "skip" ? "text-muted" : r.amount > 0 ? "text-income" : ""}`}>
                    {r.amount > 0 ? "+" : "−"}
                    {formatRM(Math.abs(r.amount))}
                  </p>
                </div>

                <div className="mt-2.5 grid grid-cols-5 gap-2 md:grid-cols-4">
                  <select aria-label="What is this?" className="input col-span-2 py-2 md:col-span-1" value={r.kind} onChange={(e) => patch(r.key, { kind: e.target.value as ProposalKind, categoryId: null })}>
                    {(Object.keys(KIND_LABEL) as ProposalKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  {r.kind === "transfer" ? (
                    <select aria-label="Other account" className="input col-span-3 py-2 md:col-span-2" value={r.transferAccountId ?? ""} onChange={(e) => patch(r.key, { transferAccountId: Number(e.target.value) || null })}>
                      <option value="">{r.amount < 0 ? "Went to which account?" : "Came from which account?"}</option>
                      {accounts.filter((a) => a.id !== accountId).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  ) : r.kind !== "skip" ? (
                    <select aria-label="Category" className="input col-span-3 py-2 md:col-span-2" value={r.categoryId ?? ""} onChange={(e) => patch(r.key, { categoryId: Number(e.target.value) || null })}>
                      <option value="">Choose a category…</option>
                      {catsFor(r.kind).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="col-span-3 self-center text-xs font-bold leading-snug text-muted md:col-span-3">{r.proposal.reason}</p>
                  )}
                  {r.kind !== "skip" && <input aria-label="Item" className="input col-span-5 py-2 md:col-span-1" value={r.item} onChange={(e) => patch(r.key, { item: e.target.value })} placeholder="Item" />}
                </div>

                {r.kind !== "skip" && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {r.billId && (
                      <span className="pill max-w-full bg-accent-soft text-accent-strong">
                        <span className="min-w-0 truncate">Bill: {bills.find((b) => b.id === r.billId)?.name}</span>
                        <button type="button" aria-label="Unlink from bill" className="-my-1 -mr-1.5 grid size-6 shrink-0 place-items-center rounded-full hover:bg-card/50" onClick={() => patch(r.key, { billId: null, remember: r.remember })}>
                          <X size={12} aria-hidden />
                        </button>
                      </span>
                    )}
                    {r.shareId && r.kind === "income" && (
                      <span className="pill max-w-full bg-accent-soft text-accent-strong">
                        <span className="min-w-0 truncate">Shared bill: {shares.find((s) => s.id === r.shareId)?.label}</span>
                        <button type="button" aria-label="Don't count it towards that person" className="-my-1 -mr-1.5 grid size-6 shrink-0 place-items-center rounded-full hover:bg-card/50" onClick={() => patch(r.key, { shareId: null, remember: r.remember })}>
                          <X size={12} aria-hidden />
                        </button>
                      </span>
                    )}
                    <Status tone={r.edited ? "accent" : r.proposal.confidence === "low" ? "warn" : "good"}>{r.edited ? "Your choice" : r.proposal.reason}</Status>
                    {r.signedBy === "guess" && <Status tone="warn">Direction guessed: check it</Status>}
                    {off && <Status tone="danger">Doesn&apos;t add up to the running balance</Status>}
                    {problems.has(r.key) && <Status tone="warn">{r.kind === "transfer" ? "Pick the other account" : "Pick a category"}</Status>}
                  </div>
                )}

                {r.kind !== "skip" && r.edited && (
                  <label className="mt-1 flex min-h-8 items-center gap-2 text-[11px] font-bold text-muted">
                    <input type="checkbox" checked={r.remember} onChange={(e) => setRows((all) => all.map((x) => (x.key === r.key ? { ...x, remember: e.target.checked } : x)))} className="size-4 shrink-0 accent-accent" />
                    Remember for next time
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {visible.length > shown && (
        <button className="btn w-full" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, visible.length - shown)} more
        </button>
      )}

      {error && (
        <p role="alert" className="banner banner-danger leading-snug">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}

      {/* The commit bar. It floats above the phone's tab bar (70 px plus the iPhone's safe area), and this one shadow is the
          design's single exception to "no shadows": the bar lies over white cards, so nothing else would set it apart. */}
      <div className="card sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 space-y-2.5 px-4 py-3.5 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] md:bottom-4">
        {check.mismatches.length > 0 && (
          <label className="flex items-start gap-2 text-[13px] font-bold">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-accent" />I&apos;ve checked the lines marked red and want to import anyway.
          </label>
        )}
        {preview.accountCheck?.looksLike && (
          <label className="flex items-start gap-2 text-[13px] font-bold">
            <input type="checkbox" checked={ackAccount} onChange={(e) => setAckAccount(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-accent" />
            This really is {preview.account.name}&apos;s statement; import it here anyway.
          </label>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-40">
            <p className="text-[13px] font-black">
              {toImport.length} {toImport.length === 1 ? "line" : "lines"} to import
            </p>
            {problems.size > 0 ? (
              <p className="mt-0.5 flex items-start gap-1 text-[11px] font-bold leading-snug text-warn">
                <AlertTriangle size={12} className="mt-px shrink-0" aria-hidden />
                <span>
                  {problems.size} line{problems.size === 1 ? " needs" : "s need"} a category or account before you can import.
                </span>
              </p>
            ) : (
              <p className="sub !text-[11px]">Every line is sorted</p>
            )}
          </div>
          <button className="btn-primary shrink-0" onClick={save} disabled={pending || problems.size > 0 || toImport.length === 0 || (check.mismatches.length > 0 && !ack) || (!!preview.accountCheck?.looksLike && !ackAccount)}>
            {pending && <Loader2 size={16} strokeWidth={3} className="animate-spin" />} Import {toImport.length} {toImport.length === 1 ? "entry" : "entries"}
          </button>
        </div>
      </div>
    </>,
  );
}
