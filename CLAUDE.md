# Money Tracker - notes for working on this repo

Local-first personal finance tracker (MYR). Next.js 16 (App Router, **Cache Components on**) + SQLite (better-sqlite3) + Drizzle + Tailwind + Recharts + Vitest.
`AGENTS.md` says this is not the Next.js you know: read `node_modules/next/dist/docs/` before writing Next-specific code.

## Commands

**pnpm only** (no `package-lock.json`; the lockfile is `pnpm-lock.yaml`).
`pnpm dev` · `pnpm test` (~400 tests, a few seconds) · `pnpm lint` · `pnpm run build` · `pnpm run seed:demo` (writes `data/demo.db`) · `pnpm run db:generate` (after editing `src/db/schema.ts`).
To build/test while the user's `pnpm dev` is running, set `NEXT_DIST_DIR=.next-test` (read by `next.config.ts`) so the two don't fight over `.next`, run on another port, and delete the folder afterwards. Don't stop a server you didn't start.
**Supply-chain policy (pnpm 11):** dependency install scripts are denied via `allowBuilds` in `pnpm-workspace.yaml` (none are needed: better-sqlite3 ships prebuilt binaries), and pnpm refuses versions published within its `minimumReleaseAge`. If pnpm ever wants to add a `minimumReleaseAgeExclude` entry, don't accept it silently: lower the version range in `package.json` to an older release instead (this happened with `lucide-react`).
Run against a throwaway DB: `$env:DB_PATH="data/demo.db"; pnpm dev`. Never point tests or demos at `data/finance.db`.

## Rules that are easy to break

- **Money is integer sen.** Convert only through `src/lib/money.ts` (`parseSen`, `formatRM`). Never store or add floats.
- **All DB access goes through `getDb()`** (`src/db/client.ts`). With Cache Components, a synchronous better-sqlite3 query is a "predictable value" and gets *prerendered at build time*; `getDb()` calls `await connection()` first to force request-time. It also enforces the optional PIN lock (`requireAuth`). Don't open the DB any other way in app code.
- **Drizzle query builders are thenable.** Returning one from an `async` function executes it. Keep builder helpers synchronous (see `baseSelect` in `src/lib/queries/transactions.ts`).
- **Every route needs a Suspense boundary *below* the shared layout**, or `next build` fails / dev shows "blocking route". Each route folder has a one-line `loading.tsx`; a page that reads `searchParams` outside `(app)` needs its own `<Suspense>` (see `src/app/login/page.tsx`). `usePathname()` in client nav is wrapped in `<Suspense>` too.
- **`var()` does not work in SVG presentation attributes** (`fill="var(--x)"` renders black). Chart colours live in CSS classes in `globals.css` (`.viz-line-*`, `.viz-bar-*`); components set `className`, not colours. Palette = dataviz slots 1-3: spending/needs blue, income/saved aqua, wants/comparison orange, de-emphasis gray.
- **Transfers are neither income nor spending.** An investment is an account of type `investment`; contributing is a transfer. Analytics read `listFlowRows` which excludes transfers.
- Balances are always derived from transactions (`getAccountBalances`), never stored.
- `middleware.ts` is now `src/proxy.ts`.

## Pay cycles, bills and the savings flow (`src/lib/plan`)

- The user's month runs **payday to payday**, not calendar month. Cycles come from Salary income (`cycle.ts`); the next payday is predicted from the median day-of-month. Only the Plan page and the leak detector's savings findings use cycles; the dashboard stays calendar-month.
- Accounts have a `purpose` (`spending` | `savings`), exclusive per role (`saveAccount`). Plan features need the spending account to be set; they degrade to a prompt in the UI when it isn't.
- `recurring_bills` are matched to transactions by `billId` (set by "mark paid") or by description (`descriptionMatchesBill`): bill **keywords match as substrings, the bill name only as a whole word** (a rent bill must not match "PARENTS"). A bill amount may be a range (min/max); totals use the midpoint, "safe to spend" uses the max.
- `savings-flow.ts` splits money drawn from savings into a **planning gap** (the payday split left too little for the bills: `min(drawn, max(0, billsFromSpending - leftAfterDeposit))`) and **everyday-from-savings** (the rest). The planning gap is never presented as a saving; only the everyday part is.
- **Bills paid straight from the savings account never needed a top-up**, so only `billsFromSpending` (bills paid from the spending account) counts toward the planning gap. That money is reported separately as `spentFromSavings` (+ `savingsSpendTop`, the biggest categories) and drives the `savings_spending` finding, which claims no saving: it is spending paid from the wrong place.
- `paydayDeposit` = transfers to savings in the cycle's first 7 days (all of them if none fell there). "What you usually move" averages that, so a one-off transfer mid-cycle (e.g. a final payslip) doesn't inflate it. A cycle in progress counts as soon as its payday move exists.
- `detectLeaks` takes `billItems` (registered bill names); those are planned spending, so they're never a "spike" or a "habit".
- Transfers stay out of income/spending everywhere; the leak detector reads `plan.flows` for the savings findings.

## Bank statement import (`src/lib/import`, `src/app/actions/import.ts`)

- Pipeline: PDF (`unpdf`, positioned text items grouped into lines) / CSV / pasted text -> `ParsedRow[]` -> `checkBalances` -> `classifyRows` -> review UI -> `commitRows`. Everything runs server-side in-process; nothing is sent anywhere. PDF passwords are used once and never stored.
- **The balance chain is the safety net**: previous balance + amount must equal the printed balance. It repairs in/out signs, reports mismatches, and only claims `openingVerified` when the statement states an opening balance. Never import rows the check rejects silently; surface them.
- Classification order: duplicate -> learned rule (`import_rules`) -> recurring bill -> built-in merchant rules -> salary guess -> default. Cash withdrawals are **transfers** to the cash account; Touch 'n Go reloads are **expenses** (so they aren't double counted).
- Dedupe uses `importKey` (a fingerprint stored on the transaction) plus a one-to-one fuzzy match (same amount, within 2-3 days) so a transfer logged by hand is recognised from either account's statement.
- `commitRows` is all-or-nothing in one DB transaction, validates every row, remembers rules, and sets an opening balance only for an account with no transactions yet.
- Server actions are capped at 1 MB by default; `next.config.ts` raises it to 10 MB for statement uploads.
- **Page breaks (Maybank):** a row can straddle two pages, with its payee lines at the top of the next page under the column header. `parseStatementText` drops everything from the "Perhation / Note" footer to the next column header *without* ending the open row, so those lines still attach to it.
- **Amounts** may carry `RM` or `MYR` (CIMB's CSV: `MYR 150.00`); `parseMoneyToken` strips both.
- **Starting balance** (`setOpeningBalance`) is allowed only when nothing on the account is dated *before the statement's first line* (`countEntriesBefore`, counting either side of a transfer). Counting all entries would block the second account of a pair, because importing the first mirrors transfers onto it.
- **Card pre-authorisations** (debit, then an equal refund from the same merchant) cancel to RM 0: `findCardHolds` (`holds.ts`) starts from the refund (its text says PRE-AUTH / REV PREAUTH) and skips both halves, source `"hold"`. Only pairs within one statement are found.
- **Bank wrapper words** (`IBK FUND TFR FR A/C`, `PAYMENT VIA MYDEBIT`, `DuitNow QR`...) are stripped by `stripBoilerplate` (`boilerplate.ts`; add a bank's wording to its `PHRASES`) before `rulePattern` and `cleanItem` run. Without that, every Maybank QR payment shared one group, so correcting one rewrote them all and `remember` saved a rule matching every QR payment. `rulePattern` returns `""` when nothing identifies the payee; such lines get a group of their own (`line-<index>`) and never become a rule.
- **Duplicate matching** (`classifyRows`, step 1): exact `importKey` first. Then fuzzy: an entry typed by hand matches within 2 days (transfers 3). An entry *imported from a statement* matches only on the SAME day (the next statement's RM 8 lunch is not yesterday's), and an imported *transfer* (mirrored from the other account) is matched only by a transfer-looking line (`TRANSFER_WORDS` and not a QR payment, or a name a learned transfer rule knows, so a layout that drops the bank's wording still matches). Loosening either silently drops real transactions. Known limit: two files whose dates differ by a day for the same transaction (value date vs posting date) are NOT recognised as the same.
- **`startDate`** (`buildPreview`) leaves out earlier lines and takes the bank's balance just before the first kept line as the starting balance. Rows keep their original `index`, so their fingerprints equal a full import's.
- **`oneSided`** lists transfers present on only one account's statement (`where: "other"` = recorded from the other statement, absent here; `"here"` = here, but the other account is imported for these dates and has no mirror). It is the early warning for money that went to an untracked account.
- **Cross-account transfers:** a learned transfer rule names the OTHER account, so one pattern can't point both ways. Own-name transfers are not necessarily to the other bank: check `oneSided`.
- Tests build **real PDFs** (`tests/pdf-fixture.ts`) rather than mocking the extractor. Real Maybank/CIMB layouts are untested; when one fails, add a fixture that reproduces its layout.

## Personal data stays out of the repo

The user's real setup (accounts, bills, income) is loaded by a throwaway script **outside the repo** (session scratchpad), run against `data/finance.db` (gitignored). Don't put real names, amounts, bank statements or PDFs in the repo, tests or docs; tests use generic bill names and invented figures (a few round scenario numbers like a RM 5,400 salary are fine; a real person's full bill list is not).

## Editing hazard on this machine

Scripted string rewrites through shell heredocs / `node -e` swallow backslashes (a `\b` regex became a literal backspace character, 0x08). Edit regexes and anything with backslashes with the Edit/Write tools, never with a script; after any scripted edit, grep for control characters.

## Analytics conventions

- `src/lib/analytics/*` and `src/lib/investing/*` are **pure** (rows in, numbers out; no DB, no clock). Keep them that way and unit-test them.
- Leak detection compares **like-for-like** (days 1..today vs the same days in earlier months). Linear extrapolation wrongly flags fixed bills like rent. A single big purchase is flagged but never annualised into a "saving".
- A baseline month counts only if the data covers it **from day 1** (`dataStart <= month-01`). Data that starts on the 26th would otherwise make the month before look nearly empty and every category look like "creep".
- Mid-month KPI comparisons use the previous month's same days, not the full month.

## Testing

`tests/db.test.ts` and `tests/actions.test.ts` run the real SQL and the real server actions against an in-memory SQLite DB; only Next's `redirect`/`revalidatePath`/`@/db/client` are stubbed. Add a test there for any new action.

## Optional price refresh

Yahoo Finance's unofficial chart endpoint + frankfurter.dev FX. Both can break; failures must degrade to "update the value by hand" with no data written. (Stooq was rejected: it now sits behind a JS anti-bot challenge.)
