# Money Tracker - notes for working on this repo

Local-first personal finance tracker (MYR). Next.js 16 (App Router, **Cache Components on**) + SQLite (better-sqlite3) + Drizzle + Tailwind + Recharts + Vitest.
`AGENTS.md` says this is not the Next.js you know: read `node_modules/next/dist/docs/` before writing Next-specific code.

## Commands

**pnpm only** (no `package-lock.json`; the lockfile is `pnpm-lock.yaml`).
`pnpm dev` · `pnpm test` (149 tests, ~2s) · `pnpm lint` · `pnpm run build` · `pnpm run seed:demo` (writes `data/demo.db`) · `pnpm run db:generate` (after editing `src/db/schema.ts`).
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

## Analytics conventions

- `src/lib/analytics/*` and `src/lib/investing/*` are **pure** (rows in, numbers out; no DB, no clock). Keep them that way and unit-test them.
- Leak detection compares **like-for-like** (days 1..today vs the same days in earlier months). Linear extrapolation wrongly flags fixed bills like rent. A single big purchase is flagged but never annualised into a "saving".
- Mid-month KPI comparisons use the previous month's same days, not the full month.

## Testing

`tests/db.test.ts` and `tests/actions.test.ts` run the real SQL and the real server actions against an in-memory SQLite DB; only Next's `redirect`/`revalidatePath`/`@/db/client` are stubbed. Add a test there for any new action.

## Optional price refresh

Yahoo Finance's unofficial chart endpoint + frankfurter.dev FX. Both can break; failures must degrade to "update the value by hand" with no data written. (Stooq was rejected: it now sits behind a JS anti-bot challenge.)
