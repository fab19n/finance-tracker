# Money Tracker

A private, local-first personal finance tracker (Malaysian ringgit). Log every ringgit in and out,
see where it leaks, get a steer on what to do with the surplus, and track how your investments grow.

Your data lives in **one SQLite file on your own computer** (`data/finance.db`). Nothing goes to the cloud.

## What it does

| Page | What you get |
|---|---|
| **Add** | Fast entry: amount, category tap, item (autocompletes from your history and prefills category and amount). Expense / Income / Transfer between your own accounts. |
| **Activity** | Every entry, searchable and filterable by month, category, account, type. Edit, delete, export CSV. |
| **Plan** | Built around a payday-to-payday month. **Safe to spend** (spending-account balance minus the bills still to pay before payday), a checklist of your recurring **bills** (rent, Netflix, a loan instalment...) with paid / due / overdue and one-tap "mark paid", a **payday plan** that works out how much to keep in the spending account and how much is genuinely spare to move to savings (in ONE transfer), and a **savings reality check** that separates what your payday split forced you to take back from savings (a planning gap) from everyday spending that ran over, shows how much was **paid straight out of the savings account** (it never passes through the spending account, so top-ups don't show it), and what you really saved. |
| **Import** | Bring in past months from a bank **PDF e-statement** (or CSV, or pasted text) instead of typing them. Recognises bills, petrol, subscriptions and ATM withdrawals, asks only about the rest, skips anything already recorded, and **checks every line against the statement's own running balance**. |
| **Dashboard** | Income, spending, what is left, net worth; spending by category; pace vs last month; income vs spending over 6 months; needs/wants/saving vs the 50/30/20 guide; budgets; the items you buy most. |
| **Insights** | The leak detector: categories creeping up, small-but-frequent habits ("latte factor"), forgotten subscriptions, over-budget categories, wants above 30% of income, spike days, **cash that went missing** (count your wallet and the gap is logged as "Unaccounted cash"), and **money shuffled back out of savings** (top-ups that your payday split made unavoidable, vs everyday overspending). Each finding shows its evidence and what it could be worth invested. |
| **Invest** | Your **savings account** (how many months of costs it covers, what it earns, and how much of it could earn more while staying safe). "What should I do with extra money?": surplus, then emergency fund, then an FD / S&P 500 split by your risk profile and horizon, with cautious / expected / optimistic projections. Plus tracking: value vs money put in, gain, yearly return (XIRR), FD accrual and maturity countdown. |
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

**First steps:**
1. *Settings* → give your two main accounts a **role** (*Spending*: where salary lands and bills are paid; *Savings*), and set each account's **opening balance** to what it holds today.
2. *Plan → Manage bills* → add your recurring payments (amount, or a range like rent 900-950, and the **due day**).
3. Either import past months (*Plan → Import statement*) or just start adding entries. Record your salary on the Plan page: that is what starts a pay cycle.

## Your payday routine, in this app

The classic leak: send a big chunk to savings on payday, then top up the spending account from savings, bill by bill, all month. Those top-ups are *transfers*, so they hide where money really goes, and the "saved" figure is overstated.

1. **Payday:** record your salary. The Plan page shows what to **keep** in the spending account (bills + an everyday allowance + a buffer) and what is **truly spare**. Move only that to savings, once.
2. **During the month:** the Add screen shows **Safe to spend**. When it goes red, you're about to spend savings.
3. **Next payday:** the **savings reality check** shows what went into savings, what came back out and why, and what you really saved.

## Importing bank statements

*Plan → Import statement.* Choose the account, then the statement file. Tested on real files:

- **Maybank** monthly e-statement **PDFs**: read directly, balance chain verified.
- **CIMB** official **e-statement PDFs** (monthly, and the quarterly ones that cover three months) and the Clicks *Transaction History* **CSV** (`Date, Transaction Details, Money In, Money Out, Balance`, amounts like `MYR 150.00`): both read directly. Don't use the PDF *print-out* of the history web page: its rows come out scrambled.
- Any other bank's PDF, CSV or pasted text: it works from what every statement shares (a date, an amount, a running balance), so most layouts are fine, and the balance check tells you when one isn't.
- Not a bank statement? A KWSP/EPF advice or a card statement with no running balance won't read as one; skip those.

- Everything is read **on your computer**; nothing is uploaded. If the bank password-protects the PDF, you're asked for the password, used once and not stored.
- Each line is checked against the statement's **running balance**: previous balance + amount must equal the next balance. A misread column or a wrong in/out direction breaks that chain and is flagged before you import anything.
- Lines it can't be sure about are shown first ("Needs a look"). Correct one and tick *Remember for next time*; similar lines are then sorted automatically in future imports.
- ATM withdrawals become a **transfer to your cash account** (not spending). Touch 'n Go reloads are recorded as spending, so they aren't counted twice.
- **Importing the same thing again is safe.** The same file again adds nothing. So does an overlapping statement, and the same transactions in another layout or wording (a CSV after a PDF, say): a line already recorded is skipped when its **date and amount** agree, even if the description differs. What can't be recognised is a file whose dates are a day off (a bank showing value date instead of posting date): check the review screen's "already recorded" count the first time you mix two formats of one account. Entries you typed by hand match within 2 days.
- **Several months, two banks (the recipe).** Pick ONE start date and type it in *Only import lines from this date on* for every statement of both banks (say 1 Jan). Import **oldest first**, your **spending account before your savings account**. Banks cut statements on different days (CIMB on the 16th, Maybank at month end), so without a common start date, transfers between the two get counted before the other account's history begins. Tick *set the starting balance* on the first statement of each account (it offers it only when allowed); the app then starts from the bank's own balance. Overlapping statements are fine: lines already recorded are skipped, so with CIMB's quarterly files you can skip the monthly ones they cover.
- **How you know it worked.** After each file the review screen says "Every line adds up to the bank's running balance". At the end, each account's balance on the Settings page should equal your bank's. If it doesn't, the difference is either a statement you haven't imported yet, or a transfer on only one side.
- **Transfers on only one side.** A transfer between your accounts appears on *both* statements. When one shows up on only one, the review screen lists it ("N transfers have no matching line on the other side"): the money went to (or came from) an account this app doesn't track, such as a wallet or another bank in your name. Add that account in Settings and edit those transfers to point at it, and the balances reconcile.
- **Card holds are not spending.** Some banks (Maybank especially) show a pre-authorisation as a debit and then a refund of the same amount from the same merchant a day or two later. The importer pairs those, shows them as "skipped: card hold released", and leaves them out, so neither your spending nor your income is inflated. (A hold whose refund lands in the next month's statement can't be paired.)
- **Guesses are labelled.** A small QR payment (up to RM 45) from someone it doesn't recognise is filed as *Eating Out* and flagged "Needs a look"; change one and similar lines (same payee) follow. Lines flagged this way import as shown unless you change them, so you can import now and tidy up later in *Activity*.
- **Mid-month statements.** A monthly PDF only exists once the month closes. For the days since, use whatever recent-transactions list your bank shows: type it, paste it, or copy it into a CSV with `Date, Description, Amount`. The importer can't check those lines against a running balance, so compare the total with your bank.
- **Bills paid from the savings account.** If rent or a subscription comes straight out of your savings account, it's still recorded as that bill's payment, and counts under **Paid from savings** on the Plan page (and in an Insights finding): that is usually the biggest hidden drain, bigger than the top-ups. Such bills don't count against your payday split, since it never had to cover them.
- Bank PDFs vary. If a statement isn't read correctly, the review screen says so (and shows which lines don't add up) rather than importing wrong numbers; use *paste text* or tell me what the layout looks like.

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
