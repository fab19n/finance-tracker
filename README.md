# Money Tracker

A private, local-first personal finance tracker (Malaysian ringgit). Log every ringgit in and out,
see where it leaks, get a steer on what to do with the surplus, and track how your investments grow.

Your data lives in **one SQLite file on your own computer** (`data/finance.db`). Nothing goes to the cloud.

## What it does

| Page | What you get |
|---|---|
| **Add** | Fast entry: amount, category tap, item (autocompletes from your history and prefills category and amount). Expense / Income / Transfer between your own accounts. |
| **Activity** | Every entry, searchable and filterable by month, category, account, type. Edit, delete, export CSV. |
| **Dashboard** | Income, spending, what is left, net worth; spending by category; pace vs last month; income vs spending over 6 months; needs/wants/saving vs the 50/30/20 guide; budgets; the items you buy most. |
| **Insights** | The leak detector: categories creeping up, small-but-frequent habits ("latte factor"), forgotten subscriptions, over-budget categories, wants above 30% of income, spike days, and **cash that went missing** (count your wallet and the gap is logged as "Unaccounted cash"). Each finding shows its evidence and what it could be worth invested. |
| **Invest** | "What should I do with extra money?": surplus, then emergency fund, then an FD / S&P 500 split by your risk profile and horizon, with cautious / expected / optimistic projections. Plus tracking: value vs money put in, gain, yearly return (XIRR), FD accrual and maturity countdown. |
| **Settings** | Accounts (with opening balances), categories (need/want, monthly budget), investing assumptions, backup, PIN lock. |

## Run it

```bash
pnpm install
pnpm dev             # http://localhost:3000
```

Requires [pnpm](https://pnpm.io) 10 or newer (developed on 11) and Node 20.9+ (developed on 24). The database, default accounts and categories are created automatically on first run.

> **About pnpm's safety defaults.** pnpm blocks dependencies' install scripts and refuses package versions published in the last day or so.
> This project needs no install scripts (`better-sqlite3` ships its native binary), so they are explicitly denied in `pnpm-workspace.yaml`.
> If `better-sqlite3` ever fails to load after a Node upgrade, set `better-sqlite3: true` under `allowBuilds` in that file, then run `pnpm rebuild better-sqlite3`.

**First steps:** open *Settings*, set each account's **opening balance** to what it holds today, then start adding entries.

### Try it with demo data first

```bash
pnpm run seed:demo   # writes data/demo.db: ~4 months of made-up MYR life with leaks planted on purpose
```
```powershell
$env:DB_PATH="data/demo.db"; pnpm dev
```

The demo script refuses to touch any database whose file name doesn't contain "demo" or "test", so it can never overwrite your real data.

## Use it from your phone (home Wi-Fi)

1. On the PC, build and start it so it listens on your network:
   ```bash
   pnpm run build
   pnpm run start:lan      # http://<your-PC-IP>:3000
   ```
2. Find the PC's address with `ipconfig` (the IPv4 address, e.g. `192.168.1.20`).
3. Allow it through Windows Firewall **once** (PowerShell as Administrator):
   ```powershell
   New-NetFirewallRule -DisplayName "Money Tracker" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
   ```
4. On your phone (same Wi-Fi) open `http://192.168.1.20:3000`, then use the browser menu → **Add to Home screen**.

Notes:
- The PC must be on and the app running for your phone to reach it. Entries save straight to the PC's database.
- Over plain `http://` on your LAN, "Add to Home screen" creates a shortcut that opens full-screen. A fully installed PWA needs HTTPS (e.g. via [Tailscale](https://tailscale.com)); there is deliberately no offline mode, because the data lives on the PC.
- **Turn on the PIN lock** (below) before using it on Wi-Fi others share.

### PIN lock (optional)

Create `.env.local` in the project folder:

```
APP_PIN=482915
```

Restart the app. Every page and action then needs the PIN (a 30-day cookie remembers your phone). Changing the PIN logs every device out.
This is a convenience lock for a home network, **not** bank-grade security: don't expose the app to the internet.

## Backups

- **In the app:** Settings → *Download full backup (.db)*. To restore, stop the app and replace `data/finance.db` with that file.
- **Command line:** `pnpm run backup` copies the live database to `data/backups/` (safe while the app is running) and keeps the newest 30.
- Add that command to Windows Task Scheduler for automatic daily backups.

## Optional price refresh

On *Invest*, give an S&P 500 holding a **ticker** (Yahoo Finance symbol, e.g. `VOO`, `SPY`, `CSPX.L`) and the **units** you hold, then press *Refresh prices*.
It uses Yahoo Finance's public chart data and the European Central Bank's exchange rates (via frankfurter.dev) to store today's value in MYR.
Both are free, keyless and unofficial, so they can break; if that happens, update the value by hand and everything else keeps working.

## How the money is modelled

- Amounts are stored as **integer sen** (RM 12.50 → `1250`), never floats.
- **An investment is just an account.** Putting money into it is a *transfer* from your bank, so it never counts as spending, and net worth, cash flow and returns all come from one ledger.
- Transfers (ATM withdrawal, e-wallet top-up, investing) are never income or spending.
- Balances are always **calculated** from your entries, never stored, so they can't drift out of sync.

## Assumptions to set for yourself (Settings)

The Invest page projections use editable assumptions: FD rate (default 3%), S&P 500 return (default 7%), emergency-fund months (6),
horizon (10 years) and risk profile. They are illustrative defaults, **not predictions** - check your bank's current rates.
Nothing here is licensed financial advice.

## Development

```bash
pnpm test            # unit tests for money, analytics, leak detection, XIRR, FD, advisor, and the SQL layer
pnpm lint
pnpm run build
pnpm run db:generate # after editing src/db/schema.ts, creates a migration in drizzle/
```

Stack: Next.js (App Router, Cache Components) · TypeScript · SQLite (better-sqlite3) + Drizzle · Tailwind · Recharts · Vitest.
All database access goes through `getDb()` in `src/db/client.ts`, which defers reads to request time (required by Cache Components)
and enforces the PIN lock. The analytics and investing maths live in `src/lib/analytics` and `src/lib/investing` as pure, tested functions.
