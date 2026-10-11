# Money Tracker: UI redesign brief v3

**This file supersedes** the earlier `design_restructure.md`, the v1 and v2 `README.md`, and anything in the v1/v2 prototypes that conflicts with it. If this file and any other file disagree, this file wins.

Read section 0 completely before doing anything. Every numbered item in this brief is a requirement unless it is marked *optional*. The brief is long on purpose: the previous round of work skipped most of the earlier brief without saying so.

---

## 0. Read this first

### 0.1 What this is

Money Tracker is a real, working personal finance app. A developer will rebuild its screens from your output. Your job is to design every screen and every state it needs, in a way that can be built exactly, using the app's real data and behaviours. The designs are not mood boards: they are the specification.

You have already produced a v1 handoff (a look-and-feel for the main screens) and a v2 patch. v1's look is liked and is kept. v3 asks you to finish the job: all screens, all states, correct tokens, and no claims that the files do not support.

### 0.2 What went wrong in v2 (so v3 does not repeat it)

| # | What happened | What we need instead |
|---|---|---|
| 1 | v2 patched v1 (the Dark prototype changed by 32 lines) and left most of the brief undone, without saying which parts. | Rebuild the two interactive prototypes from this brief (section 10). Do not patch v1. Report status per item (section 12). |
| 2 | The README said four things were fixed that were not: Transfer fields were still duplicated (From, To, and a second "Paid from" cell); the always-on "Synced" chip was still in both sidebars and Light's phone header; times were removed from one list only; "token corrections" were not applied to the canvases or to the README's own token tables. | Never mark an item done unless it is visible in a named file and frame. Section 11 lists the searches to run first. |
| 3 | Light mode was reverted to the app's *current* colours, because a reference table of today's values was read as a target. That removed the light redesign. | The reference tables (Appendix A) are *not* targets. Targets are in section 6. Light direction is an owner decision (O-1). |
| 4 | The token sheet redefined `--income` as a chart fill. In the app `--income` is the colour of income *text*; the new value gives 2.8:1 contrast on white. | Keep `--income` as a text colour. Fills have their own tokens (section 6.2). |
| 5 | The contrast audit contained estimated figures. Several were wrong (for example light warning text on its soft background is 4.31:1, which fails, but was listed as 5.4:1). Common pairs, such as muted text on the page background, were never checked. | Compute every ratio from the actual colours (section 6.4). Include rgba text, blended over its real background. |
| 6 | The README body still described v1 (4-dot PIN, biometrics, swipe, `navigator.onLine`, "tapping again deselects", multi-select chips, a "Next.js 14" app) while a v2 section at the bottom contradicted it. | Rewrite the README from scratch. A README that contradicts itself is a defect. |
| 7 | Two canvases (`Mobile App Final`, `UI Components`) were left unchanged and still show v1 colours and clock times. | Every file in the bundle agrees, or the stale file is removed (section 10.4). |
| 8 | The Login design assumed server features that do not exist ("Wrong PIN. 2 more attempts", "HTTP 429 with seconds remaining", a live countdown). | Section 8.11 states exactly what the server returns. |
| 9 | Prototype shortcuts (locked viewport, hidden scrollbars, stretched SVG charts, `type="number"` money inputs, 9–10 px text, hard-coded category lists) were kept and not marked as prototype-only. | Remove them (section 11), or label them *prototype only: do not build*. |

### 0.3 What we need from you

1. **A token sheet** with exact values for Light and Dark, in the names the app already uses, plus the new tokens in section 6.2. Contrast figures must be computed, not estimated.
2. **A component sheet**: inputs, buttons, banners, chips, tabs, accordions, dialogs, empty states and loading skeletons, each in every state, in both themes.
3. **Every screen in section 8**, in Dark and Light, at phone width (390 px) and desktop width (1280 px), with **every state listed for that screen** drawn. A state that is not drawn does not exist for the developer.
4. **Two interactive prototypes** (Dark, Light) built from sample data, in which every screen is reachable and every state can be seen, using a *clearly marked prototype-only state switcher* (a small floating panel that is not part of the design).
5. **A rewritten README** (section 10.3).
6. **A status table at the end of every batch** (section 12), listing each acceptance ID as Done / Partly / Not done, with the file and frame where it can be seen.
7. **A short list of questions**, if anything in this brief is unclear or impossible. Put them in the status table. Do not guess silently, and do not stop working while you wait.

### 0.4 Rules of delivery

1. Work in the batches in section 10.2, in order. After each batch, send the status table.
2. Before you say a batch is done, run the searches in section 11 against your own files and fix every hit.
3. Do not add features that are not in this brief (for example biometrics, push notifications, receipts, multi-currency, weekly budgets, entry times, a theme picker other than the one in O-2).
4. Use the exact wording quoted in this brief for messages, labels and states. Layout and styling are yours; copy is not, unless a line says *wording is yours*.
5. All sample data must be invented. No real people, no real merchants beyond common generic ones, no real account numbers.
6. Annotate each icon with the **Lucide** icon name (section Appendix C lists the ones already in use). The app uses Lucide only.

---

## 1. Owner decisions (the owner may edit these before sending)

| ID | Decision | Default in this brief |
|---|---|---|
| O-1 | Light theme direction | **Keep v1's mint-tinted "Vibrant Bold" light**: faintly mint page background, mint borders, mint soft-accent. You may adjust the exact values to meet contrast (section 6.4), but the light theme must read as mint-tinted, not neutral grey. Do **not** revert to the app's current neutral light colours. |
| O-2 | Theme control | **System / Light / Dark, per device.** Default System (follow the OS). Stored on the device only. Lives in Settings > Data (section 8.9). |
| O-3 | Dashboard header in Light | **Same header as Dark.** The "full-width gradient header with RM X left" described in the v1 README is *not* required and appears in no prototype. Drop it. |
| O-4 | Negative safe-to-spend styling | **Danger-toned** (not amber), in both themes. Provide tokens for it (section 6.2). |
| O-5 | Login lock-out | **Static message only.** No attempts-remaining text and no live countdown (the server provides neither). |

---

## 2. The product, its users, routes and data

### 2.1 Product facts

- A single-user, local-first personal finance tracker for one person. Currency is MYR, written `RM`. All data is in one database file on the owner's PC. Nothing is sent to any cloud.
- It is used in two places: a **desktop browser on the PC**, and an **installed phone app (PWA)** reached over a private network. The phone is where most new entries are typed.
- **Offline-first for new entries only.** When the PC cannot be reached, a new income, expense or transfer entry is kept on the phone and sent later. Pages the user has opened stay readable as saved copies. Everything else (editing or deleting a saved entry, import, settings, shared bills, investments, cash count) needs the PC and must say so.
- The user's month runs **payday to payday** (a *pay cycle*), not calendar month. Several screens can switch between pay-cycle and calendar-month views.
- Amounts: `RM 1,234.50` in lists and rows; whole ringgit `RM 5,400` in KPI tiles. Negative/positive uses a real minus `−` and plus `+`, and is never conveyed by colour alone.
- Everything shown comes from the user's own data. **Nothing may assume a fixed list** of categories, accounts, bills or people.

### 2.2 Routes (the pages that exist)

| Route | Screen | Section |
|---|---|---|
| `/login` | PIN sign-in | 8.11 |
| `/` | Add entry | 8.1 |
| `/transactions` | Activity (list) | 8.2 |
| `/transactions/[id]` | Edit entry | 8.1 (edit mode) |
| `/plan` | Plan overview | 8.3 |
| `/plan/bills` | Manage bills | 8.4 |
| `/plan/shared` | Shared bills | 8.5 |
| `/dashboard` | Dashboard | 8.6 |
| `/insights` | Insights | 8.7 |
| `/invest` | Invest | 8.8 |
| `/settings` | Settings (deep-linkable tabs, `?tab=`) | 8.9 |
| `/import` | Import a bank statement | 8.10 |
| (static) `offline.html` | "Can't reach your PC" fallback | 8.12 |

### 2.3 Data model (so you design with the real fields and do not invent others)

| Thing | Fields the user sees or edits |
|---|---|
| **Entry** (transaction) | Type (expense / income / transfer); amount; **date** (a day, **no time of day exists**); account; for transfers a destination account; category (not for transfers; **required** for expense and income); "item" (what exactly, up to 120 characters); note (up to 500). May be linked to a bill, or to a person's payment on a shared bill. |
| **Category** | Name; type (expense / income); nature (need / want / saving-or-income); **colour** (any hex the user picks); **emoji icon** (up to 4 characters); optional monthly budget; archived flag; built-in flag (built-in ones cannot be archived). |
| **Account** | Name; type (bank / cash in hand / e-wallet / investment); opening balance; **role** (none / spending / savings; at most one account has each role); archived flag. Balance is calculated from entries. |
| **Bill** | Name; category; paid-from account; amount (one figure, or a range from-to); due day of month (optional); words that appear on the bank statement (keywords); active flag; how it is split if shared (equal monthly parts, or in turns). |
| **Person on a shared bill** | Which bill; name; share per month; "sharing since" month; "until" month (if they left); words that appear on the bank statement when they pay; still-sharing flag. |
| **Settings** | Usual payday (day of month); take-home pay; everyday allowance; buffer; savings account rate (% p.a.); fixed-deposit rate; S&P 500 return; emergency fund months; investing horizon (years); risk profile (conservative / balanced / growth). |
| **Investment** | Product (S&P 500 fund/ETF, fixed deposit, ASB/unit trust, other); name; amount put in; start date; fixed deposit: rate, maturity date, interest paid (at maturity, monthly, quarterly, yearly); ETF: ticker, units held, quote currency (USD, GBP, EUR, MYR, SGD). Value updates and money in/out are recorded over time. |

---

## 3. Implementation constraints that affect design

The developer builds with: Next.js (server-rendered pages; forms are ordinary HTML forms that post to the server), Tailwind CSS with semantic colour tokens, **Recharts** for charts, **Lucide** for icons, and **Geist** as the typeface (self-hosted; your Google Fonts link is fine in prototypes). Consequences:

1. **Colour must come from named tokens.** Components never contain a raw hex. Show every colour in your designs by token name. The one exception is *user-chosen category colours*, which are data.
2. **Charts must be buildable in Recharts**: line charts, grouped bar charts, and tooltips. Plain bars, stacked bars and meters are drawn with simple boxes. Do not draw charts as stretched SVG (dots and strokes must keep their shape), and every chart needs a hover/tap tooltip and a text-table alternative.
3. **The page scrolls; the app is not a locked-viewport shell.** Top bar, sidebar and bottom bar may be sticky or fixed. Do not use an inner scroll container for the page, and do not hide scrollbars. (Why: the framework resets scroll on navigation at page level; in-page links like `#waiting` must work; the import page has a sticky action bar; iOS keyboards do not shrink `100dvh`; desktop users need visible scrollbars.)
4. **The page title and primary action of each page must work without JavaScript state**, because each screen is its own URL. Tabs inside Plan, More and Settings are links to routes (or `?tab=`), not hidden panels.
5. **Lists are paged by the server** (100 entries per page in Activity), so searching/filtering is done by the server on the whole result, not by hiding rows on screen.

---

## 4. Hard facts v1 and v2 got wrong (design to the right-hand column)

| v1/v2 design or README | The real app | What v3 must do |
|---|---|---|
| Entry rows show a time (`11:23`) | Entries have a **date only**. | No time on any entry anywhere, in any file (including the canvases). Meta line is `Category · Account`, or `A → B` for transfers. |
| Offline detected from `navigator.onLine` | The app **probes whether the PC answers**. A phone can be on wifi while the PC is off or unreachable. | States are "PC reachable / not reachable". Never say "no internet" or "offline mode" in copy that implies the phone's network. |
| A permanent "● Synced · just now" / "● Online" chip (sidebar, header) | The status chip is **hidden when everything is fine**. | Remove every permanent chip, in every file (sidebars, headers, canvases). Design only the attention states (section 7.3). |
| "Lock now (signs out all devices)" | Lock now signs out **this device** and clears the pages saved on it. Unsent entries stay on the phone. The PIN is set by the owner in a config file; **there is no in-app "change PIN"**. | Copy as in section 8.9. |
| Login: 4 dots, custom number pad, Face ID/fingerprint key | The PIN is **any length** (an example is 6 digits), typed into a normal password field. **No biometrics.** The server locks sign-in for one minute after 5 wrong PINs. | Section 8.11. |
| 12 hard-coded expense + 6 income categories (with both "Transport" and "Transport & Fuel") | Categories are **user-defined**, any number, any name length, each with its own colour. The form shows 9 tiles then "Show all N categories". | Tiles for any number/length (section 8.1). Prototype data comes from a data object, not hard-coded markup. |
| Selected category tile = accent colour | Each category has its **own colour**. | Selected tile uses the category's colour (tinted fill + border) plus a non-colour cue (a check). |
| Tapping a selected category clears it | A category is **required** for income and expense; there is no "none". | Tap selects; it never deselects. |
| Money inputs are number spinners | Money fields are **text with a decimal keypad** so `1,234.50` parses safely. | Money fields are text inputs, no spinner. |
| Transfer shows From and To tiles **and** a separate account cell | A transfer has From, To and Date **once each**. | Fix, and prove it with a Transfer frame. |
| Aside (safe-to-spend, balances, **Today's list**) placed *above* the form on a phone | The owner opens the app to type. Today the compact safe-to-spend card and balance chips are above the form, but **Today's list and the outbox come after the form**. | On a 390 × 844 phone the amount field is visible without scrolling. Today's list and the full outbox are below the form. |
| "Already in your books?" warning under the amount, with a separate "Add anyway" button | The warning appears about half a second after typing, and the submit button itself changes to "Add expense anyway". | Warning goes **below the fields, above the submit button**. No separate "Add anyway" button (section 8.1). |
| Swipe/long-press to reveal Edit and Delete | Edit (pencil) and Delete (bin, asks to confirm) are visible buttons today. | No gesture-only controls. Visible Edit/Delete or a "…" menu; a row tap opens the entry. |
| Activity chips are multi-select, search filters rows on screen | Filters are server-side and single-valued; 100 entries per page. | Section 8.2. |
| "One-tap Mark paid" on a bill | Marking a bill paid asks for the amount paid (pre-filled) and the date. | Inline form (section 8.3). |
| Token `--income` = chart fill | `--income` is the colour of **income text**. | Section 6.2. |
| "AI advisor" | The advisor is calculated by the app from the user's own numbers and stated assumptions. It is not an AI model. | Call it "Advisor". |
| Light theme "default on phone", dark "default on PC" | Both devices **follow the OS by default** (System). | Section 6.5. |
| Greeting "Good morning" | The server does not know the user's local time. | No greeting. |
| Version line "v1.0.0" | There is no real version string to show. | Omit it. |
| Hero secondary text at 75% white on the light gradient | Measures **2.8:1** on the gradient's light end. | Solid colour that passes (section 6.4). |

---

## 5. Settled decisions (do not re-open)

1. **Theme**: System / Light / Dark per device (O-2). Both themes complete for every screen. Differences between themes are expressed **only through tokens** (section 6.2), never as one-off rules on a component, because the app swaps themes by swapping token values.
2. **Light direction** is the mint-tinted one (O-1).
3. **Navigation**: five phone tabs: Add, Activity, Plan, Dashboard, More. *More* opens Insights, Invest and Settings, which keep their own pages and share a tab strip. Desktop: a 228 px sidebar with the same items; Settings is pinned at the bottom and must not appear twice under different labels.
4. **Plan has three route-based tabs**: Overview, Bills, Shared bills.
5. **Settings has five route-based tabs** (Accounts, Categories, Payday, Investing, Data); deep-linkable, so other screens can say "Set it in Settings" and land on the right tab.
6. **The "Already in your books?" warning stays below the fields** (section 8.1).
7. **Activity filters are single-select and server-side**. No multi-select chips.
8. **No gestures** (swipe, long-press). Everything is reachable with visible controls.
9. **Typeface: Geist**, weights up to 800.
10. **Text floor: 11 px.** Nothing a user must read is smaller. Tap targets for primary controls: at least 44 × 44 px on phone.
11. **Charts keep tooltips and a text alternative.**
12. **Never colour alone.** Every status has an icon or a word too.

---

## 6. Tokens, themes and accessibility

Acceptance IDs: T-1 token sheet (6.1, 6.2, 6.5); T-2 computed contrast matrix (6.4); T-3 theme-specific tokens (6.2); T-4 type, spacing and radius scales (6.3).

### 6.1 Rules

- Deliver tokens as **CSS custom properties** with the names below, Light and Dark, in one sheet. The sheet is the single source of truth: every prototype, canvas and README value must match it.
- Colours in your prototypes should be defined once as variables and used by name. (In SVG, use classes that set `fill`/`stroke` from the variables, because variables do not work in SVG presentation attributes.)
- Provide a **third state "System"** note: when the user has not forced a theme, the app applies Dark when the OS is dark and Light otherwise. You only supply the values.

### 6.2 Token names

Existing names the app uses (keep their meaning):

`--background  --foreground  --card  --muted  --line  --accent  --accent-fg  --accent-soft  --danger  --danger-soft  --warn  --warn-soft  --income  --series-1  --series-2  --series-3  --series-gray  --ink-muted  --grid`

Meanings that must not change:

- `--income` is the colour of **income text and positive amounts** (in Light it is the accent green, in Dark the light accent green). It must pass 4.5:1 on every surface it appears on.
- `--series-1` spending / needs (blue), `--series-2` wants / comparison (orange), `--series-3` income / saved (green), `--series-gray` previous period. These are **chart and fill** colours only.
- `--muted` is the **only** secondary text colour. There is no third, lighter text tier. If you think you need one, it must pass 4.5:1 on the surfaces it sits on.

New tokens you must define (rename if you must, but provide each, in both themes):

| Token | Purpose |
|---|---|
| `--card-subtle` | Nested areas, sidebar, bottom bar, tab strips |
| `--hero-bg`, `--hero-fg`, `--hero-secondary`, `--hero-border`, `--hero-shadow`, `--hero-icon-bg` | The safe-to-spend card (bordered in Dark, gradient in Light) |
| `--hero-danger-bg`, `--hero-danger-fg`, `--hero-danger-secondary`, `--hero-danger-border` | The same card when safe-to-spend is negative |
| `--btn-shadow`, `--card-shadow` | Primary button and card shadows (Light only; `none` in Dark) |
| `--focus-ring` | Keyboard focus outline |
| `--overlay` | Behind dialogs and sheets |
| `--info` (+ `--info-soft`) | Neutral informational banners, if you use blue for them |

Do **not** use `rgba` white for hero secondary text on a gradient unless the *blended result* passes (section 6.4).

### 6.3 Type, space, radius

- Type scale (Geist): hero number 36–40 px / 800 / −0.04em, tabular; page title 20 px / 800; section title 14–15 px / 700; body 13–14 px / 500–600; secondary 12 px / 500; label **11 px** / 700 / uppercase / +0.08em (minimum size); amounts always tabular numerals.
- Spacing: 4 / 8 / 12 / 16 / 20 / 24 / 32 px.
- Radius: 6 (badges), 8–9 (compact buttons), 12 (inputs, small cards), 14–16 (cards), 18 (hero card), pill (chips), 20 (active nav pill).

### 6.4 Contrast: the rules and the matrix you must deliver

Rules: text under 18 px (or 14 px bold) must reach **4.5:1**; large text and UI shapes **3:1**. Test in **both** themes.

Compute with the WCAG relative-luminance formula. For text with alpha, blend it over its real background first. Deliver a matrix (table) with the computed ratio for **every text colour on every surface it is actually used on**, at minimum:

| Text colour | On these surfaces |
|---|---|
| `--foreground` | background, card, card-subtle, accent-soft, danger-soft, warn-soft |
| `--muted` | **background, card, card-subtle, accent-soft**, danger-soft, warn-soft |
| `--accent` | background, card, card-subtle, accent-soft |
| `--income` | background, card, card-subtle |
| `--danger` | background, card, danger-soft |
| `--warn` | background, card, warn-soft |
| `--accent-fg` | `--accent` (buttons) |
| `--hero-fg`, `--hero-secondary` | `--hero-bg` (both ends of the gradient) |
| `--hero-danger-fg`, `--hero-danger-secondary` | `--hero-danger-bg` |
| category-colour tint | `--foreground` text on a tile tinted with each of: pure red, pure yellow, pure blue, and a pale colour (the user picks any colour, so the label must always use `--foreground`, not the category colour) |

Known failures to fix (measured):

| Pair (v1/v2) | Ratio | Where |
|---|---|---|
| Dark `#4a6560` on `#182420` | 2.5 | footnotes |
| Light `#94a3b8` on `#f0faf5` / white | 2.4 / 2.6 | placeholders, footnotes |
| Light `#64748b` on `#f0faf5` / `#f5f7f6` / `#f0f2f1` / `#d6f1e5` | 4.46 / 4.42 / 4.23 / 3.98 | muted text on the page, sidebar, soft chips |
| Light `#b45309` on `#fdecc8` | 4.31 | warning text on its chip |
| Light white at 75% on gradient end `#059669` | 2.78 | hero secondary text |
| Light `#1baf7a` (as text) on white | 2.82 | income amounts |
| Light `#dc2626` on `#fee2e2` | 3.95 | red chips |

Adjust the *muted* colour and/or the surfaces so muted text reaches 4.5:1 on every surface in the table. Pass-by-using-bigger-text is not accepted for 11–12 px text.

### 6.5 Theme mechanism

- Default **System**: Dark when the OS is dark, Light otherwise. The user can force Light or Dark on this device (O-2). Your token sheet should not describe either theme as the default for a device type.
- The browser's theme colour (the phone status bar) follows the active theme. Give one value per theme (must suit a page of that theme's background; do not choose a saturated green bar over a pale page unless the header is the same green). The installed-app manifest can only hold one colour: state which.

### 6.6 Other accessibility rules

- Visible focus ring on every interactive element (`--focus-ring`, ≥3:1 against its surroundings).
- Respect `prefers-reduced-motion` (no essential information in animation).
- Form fields: visible label (not placeholder-only), error message under the field, and `required` clearly indicated.
- Colour is never the only signal (use icon + word).

---

## 7. Shell, navigation and global patterns

### 7.1 App shell [SH-1 phone, SH-2 desktop]

- **Phone**: top bar (logo mark + page title; status chip when needed; Settings gear), page content, bottom tab bar (5 tabs; active tab has a pill behind the icon and a bold label). Respect the home-indicator inset. The page scrolls; the bars are fixed/sticky.
- **Desktop (≥ 768 px)**: 228 px sidebar (logo, Add, Activity, Plan, Dashboard, "Insights & More", then a divider, then Settings), no bottom bar, content area with a sensible max width (about 1024 px; 768 px for Plan, Insights, Shared bills, Settings, Import).
- Show the shell with 0, 1 and 3 sync banners (7.3) so a banner never collides with a fixed bar.

### 7.2 Page header, period navigator, tabs

- Header = title (+ optional subtitle), right-aligned actions that wrap on small screens.
- **Period navigator** (Activity, Dashboard): previous, label, next. The pay-cycle version shows its date range as a second line. The next button is disabled at the latest period.
- **Tabs** (Plan, More/Settings): underline tabs, horizontally scrollable on phone, active tab bold + accent underline. Tabs are links.

### 7.3 Offline and sync: five things to design

**A. Status chip [SH-3]** (top bar; sidebar footer on desktop). **Hidden when everything is fine.** Variants: `N waiting` (accent-soft, refresh icon), `Sending…` (spinning icon), `Offline` and `Offline · N waiting` (warn, cloud-off icon), `N failed` (danger, triangle icon). Tapping goes to the waiting list on the Add page (`/#waiting`).

**B. Sync banner [SH-4]** at the top of every page. Rows stack in this priority order; each has an icon, text and optionally one action:

1. Danger: "N entries couldn't be saved on your PC. **Review**" (N = 1: "1 entry couldn't be saved on your PC.")
2. Warn: "Sign in again to send the N entries waiting on this phone. **Sign in**"
3. Warn: "Your PC answered with an error, so N entries are still waiting. It will keep trying." (N = 1: "1 entry is still waiting.")
4. Warn: "**Can't reach your PC.** This page is the copy saved *2 hours ago*. N entries are waiting to be sent. **Try now**" — "Try now" has a busy state "Looking…". Variants of the middle sentence: "It was last reachable *time*." / nothing; of the end: "Entries you add are kept on this phone and sent when it's back." (when none waiting).
5. Good, shown about 6 seconds: "Sent N entries to your PC." (N = 1: "Sent an entry to your PC.")

**C. Waiting to send [SH-5]** (a card on the Add page, anchor `#waiting`):
- Title "Waiting to send"; caption "Kept safely on this phone. The balances and totals on screen don't include them yet."
- Per entry: category emoji (transfers: arrows icon), title (item, else category, else "Transfer"/"Entry"), `Category · Account · date` (transfers: `A to B`), signed amount.
- Status line: waiting = "Saved on this phone. Waiting for your PC."; failed = danger text with icon "Your PC didn't accept this: *reason*."; being edited = accent text "Being corrected in the form above."
- Buttons: **Retry** (failed only); **Edit** (waiting) / **Edit and retry** (failed); **Discard**, which turns into **Tap again to discard** for a few seconds.
- **Retry all** in the header when more than one entry has failed.
- Design it with: 1 waiting; 3 waiting; 1 failed with a long reason; mixed; being edited.

**D. Saved copy note**: when a page is a saved copy, banner row 4 says when it was saved. Nothing else on the page changes.

**E. Fallback page [SH-6]** `offline.html`: standalone page for a page never opened before. Title "Can't reach your PC", a sentence explaining that new entries can still be added from pages already opened, and a "Try again" button. Both themes. Plain HTML/CSS (no scripts needed to display).

### 7.4 Component sheet (draw every state, both themes) [X-1…X-8]

Mapping: X-1 inputs and fields; X-2 buttons; X-3 banners; X-4 chips, tabs, segmented control; X-5 disclosure and accordion rows; X-6 confirmation dialogs; X-7 empty states; X-8 loading skeletons.

- Text input, decimal (money) input, date, month, native select (styled wrapper over a real select), textarea, checkbox, colour input, file input, segmented control (3 options), chips (selected/unselected/disabled), underline tabs, disclosure row (open/closed), accordion row, tag/pill (neutral, accent, warn, danger).
- Each field: default, focus, filled, error (message under the field), disabled.
- Buttons: primary, secondary, ghost (text), danger outline, danger text, compact (inside rows), icon-only (with accessible name); each default / hover / pressed / focus / disabled / busy (spinner + label).
- Banners with icon: info, success, warn, danger, each as one line and as title + body + action.
- **Confirmation dialog** (phone: bottom sheet; desktop: centred dialog): used for delete entry ("Delete this entry? It will be removed from your books. This can't be undone." Cancel / Delete), delete bill, remove person from a bill, archive account or category, lock now, and import "anyway" confirmations. Destructive action uses danger styling. Discard of a waiting entry uses the two-tap pattern instead of a dialog.
- **Empty states** (one calm sentence + the next step) for every list.
- **Loading skeletons** for every page (the app shows one while data loads).

---

## 8. Screens

For every screen below, deliver Dark and Light, phone and desktop, and **every state listed**. IDs in brackets (ADD-1…) are used in the status table.

### 8.1 Add entry `/` and Edit entry `/transactions/[id]`

One form, two modes.

**Layout [ADD-1].**
- Phone, top to bottom: page title; **compact** safe-to-spend card; account chips; the form; "Waiting to send" card (only if any); "Today". If entries are waiting, a one-line summary ("2 entries waiting · Review") may sit above the form, but the amount field must stay visible on a 390 × 844 screen.
- Desktop: left column ≈ 416 px: the form. Right column: **full** safe-to-spend card (includes the "about RM X a day" line), account chips, Waiting to send, Today. Do not show the safe-to-spend card twice.

**Fields in order [ADD-2].** Type selector (Expense / Income / Transfer; the selected segment is clearly "on" with more than colour) → Amount → Category tiles (not for Transfer) → "What exactly?" with suggestions from past items (choosing a past item may fill the category and amount) → Account(s) → Date → Note (a disclosure link "Add a note") → Submit.
- Account labels by type: Expense "Paid from"; Income "Into"; Transfer "From" and "To". **The date appears once.** Transfer shows exactly: From, To, Date, and one line "Moving money between your own accounts (ATM withdrawal, top-up, investing) is not spending." Draw a Transfer frame.
- Investment-type accounts can only be a transfer end, never a spend account.
- Amount: large `RM` prefix and number, text input with decimal keypad. Placeholder `0.00`.
- Submit label: "Add expense" / "Add income" / "Add transfer" (edit mode "Save changes"; correcting an outbox entry "Save and send"; with the lookalike warning showing, "Add expense anyway" etc.).

**Category tiles [ADD-3].**
- Each tile: the category's emoji and name; names can be long ("Subscriptions & Entertainment"), so allow two lines and never truncate to meaninglessness.
- Selected tile: the **category's own colour** as a tinted fill and border, plus a check mark (not colour alone). The label stays `--foreground`.
- Show the first 9 tiles, then a toggle **"Show all N categories" / "Show fewer"**. Draw N = 6 (no toggle), 9, 14 and 22.
- Tapping a selected tile does nothing. A category is required; the error is "Pick a category".
- Income uses the same tiles for income categories.

**States [ADD-4]** (all drawn):
1. Empty. 2. Typing "What exactly?" with the suggestion list open. 3. **Saving** (spinner in the button, form disabled).
4. **Error** above the button, danger banner, for example: "Pick a category"; "Couldn't reach your PC, so nothing was saved. Check that it's on and Tailscale is connected, then try again."
5. **Saved**, success banner, three wordings: "Saved" · "Saved on this phone. It will go to your PC as soon as it can be reached." · "Saved on this phone. Sign in again and it will go to your PC." (also "Saved on this phone. Your PC had a problem, so it will keep trying."). After a save the form clears and focus returns to the amount.

**"Already in your books?" warning [ADD-5]** (below the fields, above the submit button; appears about half a second after an amount, account and date exist; **new entries only**):
- Title with warning icon: "Already in your books?"
- Sentence: "Your bank import already has an entry for exactly this amount around this date. If it's the same purchase, use the bank's entry instead of adding it twice." (When no match can be reused: "…If it's the same one, open it instead of adding it twice.")
- One or more matches; each: label, then `Where · date · bank's text`. Per match: **Use this one** (only for matches that can be reused, never for transfers; it is **disabled** until the user has picked a category or typed "what exactly", with the hint: "Pick a category, or say what it was, and "Use this one" puts it on the bank's entry.") and **Open**.
- Footer: "A separate purchase for the same amount? Add it as normal."
- The submit button's label changes to "Add expense anyway"; there is **no** separate "Add anyway" button.
- Draw: 1 match reusable; 2 matches; not reusable (Open only); transfer; "Use this one" disabled.

**Correcting a waiting entry [ADD-6]**: a banner above the form — "Editing an entry waiting to be sent", or if the PC refused it, "Correcting an entry your PC didn't accept" + the reason — with a Cancel link. Submit reads "Save and send".

**Edit mode [ADD-7]** (a saved entry): title "Edit entry"; back link "← Activity"; all fields pre-filled; "Save changes"; **Delete** (danger) with the confirmation dialog; **no** lookalike warning. If the PC can't be reached: "Couldn't reach your PC. A saved entry can only be changed while it can be reached, so nothing was changed. Check that it's on and Tailscale is connected, then try again."

**Safe-to-spend card, five variants [ADD-8]** (one component, used here and on Plan):
1. **Normal**: label "Safe to spend until payday", big amount, "N days to payday" and the date, "About RM X a day for everyday things" (omitted in the compact version), footer "RM A in *Account* − RM B held back for N unpaid bills".
2. **Overdue bills**: footer adds "(2 overdue)" in danger.
3. **Negative**: danger-toned (O-4); amount `−RM 120.00`; message "Your bills need more than *Account* holds. Anything you spend now is really coming out of savings."
4. **Payday overdue**: "Payday due" replaces the day count; extra line "Payday was expected *date*. Record your salary on the Plan page to start the new cycle."
5. **Not set up**: a short card: "Choose which account is your **spending** account (where salary lands and bills are paid) and I'll show how much you can spend before payday. **Set it in Settings**" (links to Settings > Accounts).
Plus **compact** and **full** sizes for 1 and 3.

**Account chips and Today [ADD-9]**: chips show name and balance (negative in danger), scroll sideways. Today: heading "Today", right side "Spent RM X" and, if any, " · In RM Y"; rows are the same row as Activity (8.2); empty: "Nothing recorded today yet. Every ringgit counts - log your first one."

### 8.2 Activity `/transactions`

**Header and period [ACT-1]**: title "Activity"; period navigator with a calendar-month label ("October 2026") and "Show all time" (when in all-time: label "All time" and "Back to monthly"); **Export CSV**.

**Search and filters [ACT-2]**:
- Search field, placeholder "Search item, note, category". It runs on Enter or after a short pause and searches the **whole selected period**.
- Type chips, single-select: All · Expense · Income · Transfer.
- A **Filter** button opening a sheet (phone) / popover (desktop) with Category (select, "All categories"), Account (select, "All accounts"), and a Clear action. When filters are applied, show that (a count on the button or removable chips).

**Totals [ACT-3]**: three tiles for the current filter: Income, Spent, Net (Net in danger when negative).

**Groups and rows [ACT-4]**:
- Group header: a day label ("Today", "Yesterday", or weekday and date) on the left and "spent RM X" (when > 0) on the right.
- Row: 40 px round tile tinted with the **category's colour** holding its emoji (transfers: arrows icon, neutral); title = item, else category, else "Transfer"; meta = `Category · Account` when the title is the item, otherwise `Account`; transfers `A → B`; amount right-aligned: `+RM` in `--income`, `−RM` in `--foreground`, transfers muted with no sign; visible Edit (pencil) and Delete (bin) buttons, or a "…" menu. Tapping the row opens the entry.
- Stress: a 100-row day, a 90-character item with ellipsis, a long bank description, an imported row without an item.

**Pagination and empty [ACT-5]**: "← Newer" / "Older →" (100 per page); empty: "No entries match."

### 8.3 Plan overview `/plan`

Header: title "Plan"; subtitle "Pay cycle 26 Sep - 25 Oct · day 16 of 30" (and, when estimated, " (estimated - record your salary to make it exact)"); actions **Import statement** (goes to `/import`), **Manage bills**, **Shared bills**. Below: the three route tabs (7.2).

1. **Salary card [PLN-1]** (only when no salary is recorded or payday has arrived): title "Record your salary to start" or "Payday has arrived?"; sentence "Salary landing in your spending account is what starts a pay cycle. Record it and everything on this page lines up with your real month."; fields Take-home pay (RM), Received on; **Record salary**. Disabled state + "Choose your spending account in Settings first."
2. Error banner (danger) if the last action failed.
3. **Safe-to-spend** (the five variants, full size).
4. **Bills this cycle [PLN-2]**
   - Summary sentence: "5 bills = **RM 1,143.00** a month (RM 13,716 a year), 21% of your pay. Subscriptions and other "wants": **RM 96.90** a month (RM 1,163 a year)."
   - Progress line: "**3 of 5** paid · RM 978.00 out · **RM 165.00** still to find · 1 overdue" (overdue in danger).
   - Row: category emoji (a tick when paid), bill name (struck through and muted when paid), a "when" line, amount (a range `RM 55.00 - RM 60.00` if it varies; the paid amount once paid), a status pill.
   - Statuses: **Paid**, **Overdue**, **Due soon**, **Upcoming**, **No due date**. "When" lines: "Paid 1 Oct"; "Was due 5 Oct (6 days ago)"; "Due today"; "Due in 3 days (15 Oct)"; "Due 20 Oct"; "Set a due day to track it".
   - A paid bill whose amount falls outside its usual range shows a warning line: "RM 120.00 is outside the usual RM 55.00 - RM 60.00 - worth a look."
   - **Mark paid [PLN-3]**: a link that opens an inline form: Amount paid (RM) pre-filled with the expected amount, Paid on (today), **Record**. Draw closed and open. The overdue row has a danger tint.
   - Empty: "No bills yet. Add your rent, insurance and subscriptions and this becomes your payday checklist."
5. **Payday plan [PLN-4]** (recomputes as you type):
   - Four inputs: Take-home pay, Everyday allowance, Buffer, "What you usually move" (all RM, text/decimal). Helper line: where each number came from ("your last recorded salary" / "the take-home pay in Settings" / "enter your take-home pay"; allowance "from Settings" / "estimated from what you actually spent" / "your guess is fine; the Dashboard will show the truth"; "Bills use the highest amount each is expected to be (RM x).").
   - Stacked bar (Bills `--series-1`, Everyday allowance `--series-2`, Buffer `--series-gray`, To savings `--series-3`) with an accessible text label, then a legend: swatch, name, amount, percent.
   - Result card (accent-soft): "Keep RM 2,543.00 in your spending account, then move" / large "**RM 2,857.00 to savings**" / "one transfer, once, 53% of your pay. No more topping up bill by bill."
   - Variants: **Deficit** (danger, `role=alert`): "Bills + allowance + buffer come to RM x, which is RM y more than your pay. Lower the allowance or review the bills." · **No allowance entered** (warn): "Nothing is set aside for groceries, fuel, Touch 'n Go and food yet, so "move to savings" below is overstated. Enter an everyday allowance above, even a rough guess." · **"What your usual RM x really does"** explainer (bordered box, two short paragraphs).
   - "Record the transfer" form: Amount you moved to savings (RM) pre-filled with the result, Date, **I moved it**. Disabled with "Choose your spending and savings accounts in Settings to record the transfer here."
6. **Savings reality check [PLN-5]**
   - Lead card: "Last cycle · *range*" (or "This cycle so far"). Narrative: "You moved **RM A** to savings and took **RM B** back out." Optional paragraphs: a warn "built into your payday split: only RM x stayed behind, but the bills paid from that account came to RM y. Fixable by moving less at payday."; a danger "paid straight out of savings (*Top categories*), never touching your spending account. So about RM x of the RM y you moved actually stayed there." or "…savings went **down by RM x** even though you moved RM y in."; a danger "more came out because **everyday spending** (RM x) ran past what was left. That's the leak to watch."
   - Highlight chip (accent-soft): "What you really saved: RM x (31% of your income), not the RM y you moved."
   - Table: Cycle · Income · To savings · Taken back · Paid from savings · Everyday · **Really saved** (negative in danger; an "in progress" tag). Horizontal scroll on phone with the Cycle column staying visible.
   - Variants: not set up ("Choose your spending and savings accounts in Settings, and this shows how much of what you "save" really stays saved."); no data ("Record your salary (above) and a few entries, and this compares what you move to savings with what you take back out each cycle."); no movement ("No transfers between your spending and savings accounts recorded in this cycle yet.").

### 8.4 Manage bills `/plan/bills` [BIL-1]

Title "Bills & subscriptions"; back link "← Plan". A list of bills; each is a row that expands into the bill form. Plus an "Add a bill" form (open when there are no bills).
- **Bill form fields**: Bill name; Category (select with emoji); Paid from (select "Paid from *Account*"); Amount (RM); "…up to (if it varies)" (RM, optional: makes it a range); Due day (1–31); "Words on the bank statement (netflix, tnb)"; **Active** checkbox; **Save bill** / **Add bill**; and, when editing, **Delete this bill (payments already recorded stay)** (danger, with confirmation).
- Collapsed row: name, amount or range, due day ("due 5th" or "no due day"), tags for "inactive" and for "shared" (links to Shared bills). Draw 8+ bills, an inactive one, a range one, a long name.

### 8.5 Shared bills `/plan/shared` [SHR-1…3]

**Page frame [SHR-1]**: back link "← Plan"; title "Shared subscriptions"; one collapsible explanation: "A bill can be split two ways. **Equal parts** (Netflix): each person owes their share of every month, and whatever they send pays their oldest unpaid month first, so a lump sum for three months and a single month both work. **In turns** (Spotify): one person pays the whole month, you take the first month of each cycle, and a payment settles that person's own month." Banners: error (danger); success "Counted N payments you had already received from them." Then:
1. **KPI trio**: "Owed to you" (RM; hint "N people" or "everyone is paid up") · "Shared bills" (count; "N people sharing") · "Unclaimed money in" (count; "entries not counted towards anyone").
2. **Who owes you**: rows biggest first: `Person · Bill` left; `RM 44.50 (2 months)` or `(Oct, Nov)` right, in warn.
3. One card per shared bill (below).
4. **"Money in, not yet counted towards anyone"**: caption "If one of these was somebody paying their share, say who. It then counts towards their oldest unpaid months. Leave the rest alone." Rows: description, date, `+RM`, a "From…" select (pre-selected if one person fits), and the button "Yes, count it" (pre-selected) or "Count it". Shows 15 most recent, then "Showing the 15 most recent of 40."
5. **"Add someone to a shared bill"** (open when there are none): Shared bill (select), Person's name, Their share per month (RM), Sharing since (month), Until (if they left) (month), "Words on your bank statement when they pay you", **Still sharing** checkbox, **Add person**. Editing a person uses the same form with **Save** and **Remove from this bill (money they sent stays in your records)**.

**Card A: equal monthly parts [SHR-2]**
- Header: bill name; "RM 55.00 a month · it costs you **RM 11.00** once the others pay their part".
- Banner: warn "Owed to you: RM 66.75" or good "Everyone is paid up." (+ " (RM x paid in advance)").
- People (each an expandable row): name, "RM 22.25 / month", a "left" tag with "after Sep 26" if they left; standing text, one of: "Owes RM 44.50 (2 months, since Aug)" (warn) · "Paid ahead 2 months" or "Credit RM 5.00" (accent) · "Paid up". Expanded: "Covered through Oct 26. Last paid RM 22.25 on 5 Oct. Charged RM 222.50 so far, received RM 178.00." + the edit form.
- **Month grid**: up to **12 months** as columns (month + 2-digit year), one row per person; **four cell states each with its own mark**: paid (check), part-paid (½), not paid (cross), not sharing yet (dot). Legend: "paid · ½ part paid · not paid yet · a lump sum covers the oldest months first". Must scroll sideways on a phone with the name column staying visible. Cells have an accessible name like "Person A, Aug: paid".
- A control to switch how the bill is split (equal parts / in turns).
- Draw: owed; paid ahead; credit; left person; part-paid month; a bill with 12 months of history.

**Card B: paid in turns [SHR-3]**
- Header: "RM 30.90 a month · **one person pays the whole month**, in turn".
- Banners: warn "Owed to you: RM 61.80 · Oct Person A, Nov Person B" (a partial turn shows its amount); or good "Nobody owes you for a month they covered."; warn "**Oct 26 and Nov 26** are still open: nobody has said they'll cover them yet." (with " Dec 26 stay open too: whoever covers a month gets it."); neutral "Open: Dec 26. Whoever says they'll cover a month gets it."
- **"Which month did they cover?"** prompt, one per payment that has no month yet: "**Person A** sent RM 30.90 on 5 Oct. Which month did they cover?" + a month select + **Count it**; or "No month is open this cycle: set it in the planner below."
- People: standing is one of "Owes RM 30.90 for Oct" · "RM 30.90 sent, month not set" · "Paid up · next turn Nov 26" · "Covered this cycle" · "Hasn't covered a month this cycle yet". Expanded: one line per covered month — "Oct 26 · paid 5 Oct" / "RM 10.00 of RM 30.90 paid (5 Oct)" / "not paid yet" / "coming up" — and the edit form.
- **Turn grid**: columns = the latest two cycles (12 months). A "You" row marks your months ("you", plus a check once the bill was charged). Each person row marks only that person's months: **paid** (check) · **part** (½) · **due** (cross; the month has come and it is not paid) · **coming up** (empty circle) · **not their month** (dot). An open month shows a **?** in its column header. Legend covers all marks.
- **"Who covers which month"** planner (collapsible; open when a past month is still open): one select per month — "Nobody yet" / "You" / each person — in a 2–3 column grid, with **Save**.
- Draw: all banners; one prompt; the grid with open months; the planner.

### 8.6 Dashboard `/dashboard`

- **Header [DSH-1]**: title; a two-option toggle between pay-cycle view and calendar-month view (clear labels); the period navigator (cycle view shows the date range as a second line). Same in Light and Dark (O-3).
- **KPI tiles, four [DSH-2]**: Income · Spent · third tile (three states) · Net worth.
  - Third tile: "Net so far" (hint "no pay in this cycle yet") · "Left over" (good colour; hint "34% of income") · "Overspent" (danger).
  - Income and Spent show a delta: arrow icon, sign, percent and a comparison label — "+12% vs Sep to date" while the period is in progress, "vs Sep" when finished, "no Sep data" when nothing to compare. Up is good for income and bad for spending.
  - Net worth hint: "cash RM x · invested RM y".
- **Empty [DSH-3]**: "Nothing recorded for *period* yet. Add entries on the Add tab and the charts fill in." (KPIs still show.)
- **Where it went [DSH-4]**: title, caption "Spending by category, *period*"; the top 8 categories as horizontal bars (emoji, name, share %, amount); bar length relative to the biggest; then a disclosure "N more categories". Names are user-defined and long: the label area must wrap or truncate gracefully (do not fix it at 76 px). Empty: "No spending this cycle."
- **Spending pace [DSH-5]**: caption "Running total through the cycle · day 1 is payday, 26 Sep"; legend (this period vs previous); line chart with a today marker and a tooltip; text-table alternative.
- **Income vs spending [DSH-6]**: caption "Last 6 cycles · each named after the month most of it falls in"; grouped bars (income `--series-3`, spent `--series-1`), legend, tooltip, text alternative.
- **Needs, wants & saving [DSH-7]**: caption "Share of your income · guide: 50 / 30 / 20"; stacked bar; three rows `swatch · label · RM · % (guide 50%)`; then either warn "Wants are RM x over the 30% guide this cycle." or good "Wants are within the 30% guide. Nice." Variant with no income: caption "Share of spending (no income recorded)", row "Saved (needs income)".
- **Budgets [DSH-8]**: caption "The tick marks where you'd be at an even pace". Per category: `emoji name` left, "**RM 680.00** of RM 800.00" right; a meter with a **pace tick that is visible in both themes**; a status line: on track (muted "On track"), watch (warn "On pace to reach RM 781.00"), over (danger "Over budget by RM 40.00"). The meter's fill colour also changes with status.
- **What you buy most [DSH-9]**: caption "Specific items by total this cycle - small and frequent adds up"; table Item (+ category) · Times · Average · Total (top 10).
- Chart colours: `--series-1/2/3` and `--series-gray` as in section 6.2.

### 8.7 Insights `/insights`

- **Header**: title; subtitle "Where your money leaks, found from your own entries. Estimates, not verdicts."
- **Headline [INS-1]**: "The top 3 findings" / large "≈ RM 4,440 a year" / "is at stake (RM 370/month). Invested for 10 years at an assumed 7%, that could become roughly **RM 7,620**. Some findings overlap (a latte also sits inside Eating Out), so treat this as a ceiling." Alternative with no findings: "No leaks found yet" and either "Keep logging - patterns need a few weeks of entries, and trends need at least two months." or "Nothing stands out against your own history right now. Nice."
- **Count your cash [INS-2]** (anchor `#cash`): icon, title "Count your cash", text "Cash is where "every penny" usually breaks. Count what's in your wallet and the gap becomes a logged "Unaccounted cash" expense - so the leak is visible." Result message above the form, four variants: shortfall (warn) "Cash was RM 25.00 short of the books. Booked as Unaccounted cash." · surplus (good) "You had RM 10.00 more cash than the books said. Booked as a cash adjustment." · match (good) "Spot on - your books match your wallet." · invalid (danger) "Enter the amount you counted, e.g. 85.50." Form: Account (select showing "Cash (books: RM 80.00)"), Actually counted (RM), **Reconcile**. Footer: "Last counted 8 days ago." (turns warn "- time for another count." after 14 days) / "You haven't counted your cash yet - try it now." / "Counted today." No cash account: "Add a "Cash in hand" account in Settings to use this."
- **Findings [INS-3]**: heading "What we found". Card: severity badge with icon — **High impact** (danger), **Worth a look** (warn), **Good to know** (neutral) — title; 1–4 evidence bullets; a suggestion paragraph; an optional savings chip (accent-soft) "Could save ≈ RM 128.00/month · RM 1,536.00/year" and "Invested for 10 years at an assumed 7% that grows to roughly RM 2,670" (only when there is a saving); an optional link "See the entries →". Types the app produces: category creep, small frequent purchases, subscriptions, over budget, wants heavy, one-off spike, weekend spending, unaccounted cash, planning gap, savings drawdown, spending paid from savings. Draw 0, 1, 3 and 8 findings.
- **Logging habit [INS-4]**: "You logged something on **24** of the last 30 days." + "Great consistency - this is what makes the insights trustworthy." or "Gaps usually mean forgotten spending. Logging right after you pay is the habit that matters most."
- **Regular payments we spotted (N)** [INS-4]: a collapsible card; summary `RM 146.90/month`; table Payment (+ category) · Every (week / month / year) · Amount · Per year.

### 8.8 Invest `/invest`

- **Header [INV-1]**: title; **Refresh prices** button (busy state; success message; failure message that says to update the value by hand and changes nothing). Portfolio KPIs: Net worth · You put in · Worth today · Growth (± amount, % on money in).
- **Your savings [INV-2]**: "Your savings: *Account*"; balance (large); "Earning 2.5% now, about **RM 311.00** a year." If bills exist: "Covers **4.4 months** of your costs (RM 2,800.00/month)" and "goal 6 months = RM 17,000" with a meter (colour by progress); three coloured-dot bullets — "**RM x** stays in the account, instantly reachable: about one month of costs, for a true emergency." · "**RM x** is the rest of your emergency fund. It must stay safe, but it needn't be reachable in minutes: a fixed deposit or money-market fund you can break or redeem within days can pay more." · "**RM x** is above your 6-month goal: that's genuinely extra money. The advisor below shows what to do with it." Then one of: neutral "At your assumed rates (2.5% savings vs 3.5% fixed deposit) there's nothing to gain by moving it. Check current rates and update them in **Settings**." / good "At 3.5% instead of 2.5%, the part that can move would earn about **RM x more a year**, for the same safety. Rates are your assumptions: check what your bank really pays, and its early-withdrawal terms." With no bills: "Add your bills on the Plan page so I can work out how many months of costs this covers."
- **Advisor [INV-3]**: "What to do with your RM 1,840 surplus?" as numbered steps (circled numbers with text), and a **projection chart** comparing a fixed deposit, the S&P 500 and the user's mix over the horizon (lines, tooltip, text alternative). Always label rates as the user's assumptions, not promises.
- **How your money is growing [INV-4]**: two lines, "Worth today" vs "Money put in"; caption "The gap between the lines is growth, not deposits"; tooltip; text alternative.
- **Holding cards [INV-5]** (one per investment): name; a product tag (S&P 500 / Fixed deposit / ASB / unit trust / Investment); "**RM x** worth today"; four stats — You put in · Growth (arrow, ± amount, %) · Yearly return (XIRR) (with "short history (4 mo)" under it, or "needs 3+ months") · Interest rate (fixed deposit) or Last updated (a date, or "never"). Fixed deposit banner: "Matures 14 Jan (95 days) at **RM 5,152.00**." (+ " Decide now whether to roll it over." at 30 days or less) or "Matured on 14 Jan: **RM x** is ready to withdraw or roll over." Warn banner when no value was ever recorded: "No value recorded yet, so growth shows as zero. Use "Update value" below…". A collapsible **"Update, add money or take money out"** panel with these forms: Worth now (RM) + As of (date) + **Update value**; Add money (RM) + From (account) + Date + **Add money**; Take out (RM) + Into (account) + Date + **Take out**; Ticker + Units held + Quoted in + **Save price tracking**; **Archive this investment** (danger).
- **Add an investment [INV-6]** (accordion): "What kind of investment?" (select) with a hint line per kind; Name; Amount (label "Principal (RM)" for a fixed deposit, "Amount put in so far (RM)" otherwise); Date ("Start date" / "Date invested"); Paid from; **fixed deposit extras**: Interest rate (% p.a.), Matures on, Interest paid (At maturity (simple) / Compounded monthly / quarterly / yearly); **ETF extras**: Ticker (optional), Units held (optional), Quoted in; checkbox "Also record the transfer out of that account (keeps your bank balance accurate - it's not counted as spending)"; **Add investment**.
- **Empty [INV-7]**: no investments yet, with the Add form open.

### 8.9 Settings `/settings`

**Tabs [SET-1]**: five route tabs: **Accounts · Categories · Payday · Investing · Data**. Error banner (danger) at the top for failed saves. Tabs scroll sideways on a phone and are linkable with `?tab=`.

- **Accounts [SET-2]**: intro "Set each account's **opening balance** to what it held the day you start tracking. Balances are then calculated from your entries." and "Give two accounts a **role**: *Spending* (where salary lands and bills are paid) and *Savings*. That lets the Plan page tell a top-up from savings apart from real spending." Each account is an accordion row: name, type tag (Bank / Cash in hand / e-Wallet / Investment), role tag (spending / savings), "archived" tag, balance. Expanded: Name, Type, Opening balance, Role ("No special role" / "Spending: salary lands here, bills paid from it" / "Savings: emergency fund / money set aside"), **Save**, **Archive account** / **Restore account**. Below: **Add account** form. Archived rows are dimmed.
- **Categories [SET-3]**: intro "Tag each expense as a **need** or **want** - the dashboard compares your split with the 50/30/20 guideline. Add a monthly budget to be warned when you overspend." Two groups: "Expense categories", "Income categories". Row: emoji on a tile tinted with the **category's colour**, name, need/want tag (expense only), budget (`RM 800.00/mo`), archived tag. Expanded form: Name; Type (Expense / Income); Nature (Need / Want / Saving/Income); Emoji (up to 4 characters); Monthly budget (RM); **Colour** (design a swatch row plus a custom colour option, not a bare browser input); **Save**; **Archive category** / **Restore category** (not offered for built-in categories). Below: **Add a category**. Draw 25 categories, a long name, an archived one.
- **Payday [SET-4]**: intro "Your month runs payday to payday. These settings drive the **Plan** page: how much to keep for everyday things, and what to move to savings." Fields: Usual payday (day of month); Take-home pay (RM); Everyday allowance (RM); Buffer (RM); Savings account pays (% p.a.); **Save**. Footnote: "Leave the allowance blank and the app suggests one from what you actually spend. The payday day is only used until you've recorded a salary; after that it learns your real payday."
- **Investing [SET-5]**: intro "Used by the Invest page for projections. These are **illustrative defaults, not promises** - check your bank's current fixed-deposit rate and adjust." Fields: FD rate (% p.a.); S&P 500 return (% p.a.); Emergency fund (months); Investing horizon (years); Risk profile (Conservative / Balanced / Growth); **Save assumptions**.
- **Data [SET-6, SET-7]**:
  1. **Appearance card first [SET-7]**: title "Appearance"; a three-way segmented control **System · Light · Dark** (icon + word); helper "This device only. Your phone and your PC each keep their own choice."; when System is selected, show what it resolves to ("System (currently dark)"). Applies instantly, no Save button. It is the one Settings control that **works without the PC**, so it needs no offline warning. Draw each option selected, in both themes.
  2. "Everything is stored on this computer" — "In `data/finance.db` - nothing is sent to the cloud. Back it up now and then (or run `pnpm run backup`)." Buttons **Download full backup (.db)** and **Export every transaction (CSV)**.
  3. **PIN lock: on / off.** When on: a **Lock now** button with the copy "Signs this device out and clears the pages saved on it. Entries not yet sent stay on the phone." When off: "Anyone on your Wi-Fi who opens this address can see your data. To require a PIN, add a line like `APP_PIN=482915` to a file named `.env.local` in the project folder and restart the app."
  4. No version line.

### 8.10 Import a bank statement `/import` [IMP-1…6]

The most complex screen and the one v1/v2 skipped entirely. It is reached from Plan's **Import statement** button. Everything is read on the owner's PC; nothing is uploaded. Three phases.

**Phase 1: Choose the file [IMP-1]**
- "Which account is this statement for?" (select; each option shows the name and its role in brackets, e.g. "Main (spending)").
- "Statement file (PDF or CSV)" file picker; note with lock icon: "Read on this computer only. Nothing is uploaded anywhere."
- "Only import lines from this date on (optional)" date input; help: "Use the same date for every statement and both banks (say 1 Jan). Banks cut their statements on different days, so without this, transfers between your two accounts get counted before the other account's history begins."
- **Password field**, shown only when the PDF is protected: label "This PDF is password-protected", placeholder "PDF password (not saved)".
- Disclosure "Or paste the statement text instead" with a text area ("Select all in your PDF viewer, copy, and paste here…").
- Error banner (danger, warning icon); **Read statement** button (busy state; disabled until a file or text exists).
- **"Tell me which column is which" [IMP-2]**: appears for a CSV whose columns are not recognised: a small table of sample rows with a select above each column (date / description / amount / money in / money out / balance / ignore) and an **Apply** button.
- A help panel "Where to get the file": per-bank pointers; bank PDFs are often password-protected; import oldest first; spending account before savings account; banks before an e-wallet; tick "set the starting balance" only on the earliest statement of each account; the app checks every line against the bank's running balance.

**Phase 2: Review [IMP-3, IMP-4, IMP-5]**
- **Summary card [IMP-3]**: "*Main*: 126 lines · 1 Sep to 30 Sep" and "← Choose a different file".
- **Balance check banner** (one of three tones): good "Every line adds up to the bank's running balance (126 of 126 checked)." — or for an e-wallet with no running balance "These lines take the account from RM 100.00 to RM 340.50, exactly where the statement says it ended." · danger "3 lines don't add up to the bank's running balance - they're marked below." (or "These lines don't reach the statement's closing balance - see below.") · warn "This statement has no running balance to check against, so please look over the amounts and directions yourself."
- Small warn lines for the statement's own warnings.
- **Counts line**: "**84** new · 30 already recorded (skipped) · 6 lines that cancel out: card holds and reversed transfers (skipped) · 12 earlier lines left out (before 1 Sep) · **5** need a look".
- **Wrong-account alert** (two severities): danger "This looks like *Savings*'s statement, not *Main*'s" with the explanation "On 1 Sep the statement starts at **RM 8,000.00**, but your entries say *Main* held **RM 2,500.00**, while *Savings* should hold exactly the statement's figure. Importing it here would file *Savings*'s transactions under *Main*." and a button **Read it as *Savings* instead**; or warn "This statement doesn't start where your books for *Main* leave off" with the difference ("a difference of RM x. Either it belongs to a different account, or entries before this date are missing or wrong (a transfer to an account the app doesn't track, for example).").
- **One-sided transfers alert** (warn): "N transfers between your accounts have no matching line on the other side" + "A transfer should appear on both accounts' statements. These didn't, so the money probably went to (or came from) an account this app doesn't track. If so, add that account in Settings and edit these transfers; otherwise the two balances will drift apart by these amounts." + up to 8 lines (`1 Sep · +RM 200.00 · note` with "(from the other account's statement; not on this one)" or "(on this statement; not on the other account's)") + "…and N more".
- **Starting-balance checkbox** (only for an account with no entries yet): "Set *Main*'s starting balance to **RM 2,500.00** (the balance before the first line), so the app matches your bank." plus, when inferred, in warn: "The statement didn't state it, so this is worked out from the first line - check it against your statement."
- **Filter tabs**: "Needs a look (5)" · "All (84)" · "Skipped (36)". Empty: "Nothing needs a look. Switch to "All" to review everything."
- **Line cards [IMP-4]** (60 per page, then "Show 24 more"). Each card: the bank's description (truncated), date, signed amount (`+` in `--income`). Controls: **What is this?** (Spending / Income / Transfer / Skip); **Category** select ("Choose a category…") — or, for a transfer, **Other account** ("Went to which account?" / "Came from which account?") — and **Item** text. Under them, small tags and notes: a bill-link chip "Bill: Netflix ✕" and a shared-bill chip "Shared bill: Person A ✕" (✕ unlinks); the app's reason ("Matches your Netflix bill", "Looks like food") or "Your choice"; **"Direction guessed: check it"** (warn); **"Doesn't add up to the running balance"** (danger); **"Pick a category"** / **"Pick the other account"** (warn); a **"Remember for next time"** checkbox that appears after the user edits a line. Card borders: danger for a balance mismatch, warn for a missing choice; skipped lines are dimmed and show their reason in place of the controls. Correcting one line carries the choice to untouched lines from the same payee: a subtle cue ("also applied to 3 similar lines") is welcome.
- **Sticky bottom bar [IMP-5]** (above the phone tab bar; must not cover the last card): "2 lines need a category or account before you can import."; checkboxes when needed: "I've checked the lines marked red and want to import anyway." and "This really is *Main*'s statement; import it here anyway."; primary **Import 84 entries** (busy state; disabled until problems are resolved and acknowledgements ticked). Error banner above it for a failed import.

**Phase 3: Done [IMP-6]**: "Imported 84 entries" with a check icon, then bullets (each only when it applies) — "N of them are transfers (not counted as spending)" · "N lines were skipped (already recorded, or skipped by you)" · "Remembered N rules, so similar lines are sorted automatically next time" · "Set *Main*'s starting balance so the app matches your bank" — and buttons **See your plan**, **View activity**, **Import another statement**.

Design with: a 100+ line statement; a 120-character bank description; a review with every alert showing; a review with none; a statement with no running balance.

### 8.11 Login `/login` [LOG-1…3]

**What the server really does.** The PIN is any length. The login form posts the PIN (and a hidden "where to go next" value). On a wrong PIN the server returns the text **"That PIN isn't right."** After 5 wrong PINs in a row it refuses everything for one minute and returns **"Too many wrong attempts. Wait a minute and try again."** It does not return a number of attempts left, a remaining time, or an HTTP error status. (O-5: design to this.)

**Design [LOG-1]**: logo mark and "Money Tracker"; "Enter your PIN to continue"; **one PIN field** (masked, numeric keypad on phone, centred, large, any length, supports password managers and a hardware keyboard); a visible label "PIN"; an **Unlock** button (busy state with spinner). **No** custom keypad, **no** fixed dots, **no** biometrics, **no** greeting.

**States [LOG-2]**: empty; typing (masked); **wrong PIN** (danger banner with "That PIN isn't right."); **locked** (danger banner with the lock-out text; the field and button may stay usable); busy.

**Frames [LOG-3]**: Dark and Light, phone, and desktop (a centred card). Also the situation "arrived from the Sign in again link in the sync banner" looks identical; no special design needed.

### 8.12 App icon, theme colours and fallback page [PWA-1, PWA-2, SH-6]

- **Icon [PWA-1]**: a full-bleed square at 512, 192 and 180 px (the OS rounds or masks it), artwork inside the central ~80%. It must match the logo mark used in the app (wallet mark). Deliver an actual drawn icon, not only a note.
- **Theme colours [PWA-2]**: the page background hex for Light and for Dark, and the status-bar colour for each (6.5). The installed-app splash/manifest colour: pick one and say which.
- **Fallback page [SH-6]**: described in 7.3-E.

---

## 9. Content rules and sample data

- Tone: plain, calm, second person. Never alarmist: "overspent" appears only when there is real pay to compare with.
- Use the quoted strings in this brief as written. Where this brief gives no wording, write in the same voice and keep it short.
- Sample data is **invented**. Use "Person A / B / C" for people. Merchants may be generic (a grocery store, a ride service, a streaming service).
- Build the prototypes from a data object (accounts, categories with colours and emoji, entries, bills, people, investments, settings), and render every list from it.
- Stress cases that must each appear in at least one frame: a 30-character category name; 22 categories; a 60-character bank description; a 90-character item; 12 months of shared-bill history; 100 entries in a day; a negative balance; `RM 0.00`; `RM 12,345.67`; `−RM 120.00`; a person who has paid ahead; a person who has left; a bill with a range amount; an archived account; a category with a very light colour and one with a very dark colour.

---

## 10. Deliverables

### 10.1 Format

HTML design files in the same style as the earlier handoff are fine. Stills and the token sheet are what the build is made from; the prototypes are for review. Keep spacing to the scale in 6.3.

### 10.2 Batches (deliver in this order; send a status table after each)

| Batch | Contents | IDs |
|---|---|---|
| B1 Foundation | Token sheet and computed contrast matrix; component sheet; shell (phone and desktop); sync chip, banner and Waiting-to-send; fallback page; rewritten README skeleton | T-1…4, X-1…8, SH-1…6, R-1, R-2 |
| B2 Add / Edit | Add and Edit entry; safe-to-spend variants; chips; Today | ADD-1…9 |
| B3 Activity | Activity list, filters, totals | ACT-1…5 |
| B4 Plan | Plan overview; manage bills; shared bills (both cards) | PLN-1…5, BIL-1, SHR-1…3 |
| B5 Dashboard | Dashboard, all sections and states | DSH-1…9 |
| B6 Insights + Invest | Both screens, all states | INS-1…4, INV-1…7 |
| B7 Settings | All five tabs including Appearance | SET-1…7 |
| B8 Import + Login + PWA | Import (3 phases), Login, icon, theme colours | IMP-1…6, LOG-1…3, PWA-1…2 |

### 10.3 README (R-1)

Rewrite it from scratch so it contains **no** v1 text. It must list: the files in the bundle with what each is; the token summary (pointing to the token sheet as the source of truth); the screens and states with the IDs they satisfy; every *prototype-only* item (the state switcher, anything not to be built); open questions. It must **not** contain: "Next.js 14", "swipe", "long-press", "navigator.onLine", "biometric" (except to say there is none), "tapping again deselects", "multiple can be active", "4 circles", "AI advisor", "Money Tracker.dc.html", "all devices".

### 10.4 Bundle hygiene (R-2)

- Every file uses the token sheet's values. Any colour in a prototype or canvas is a token, or a user category colour from the sample data.
- Update `UI Components` and `Mobile App Final` to match, or **delete them** from the bundle. Do not leave stale files.
- `Design Directions.dc.html` is the obsolete first exploration: delete it or move it into an `archive/` folder with a note.

---

## 11. Self-check before every delivery

Search all your files for these. Every hit is a defect unless it is inside a note that says it is *prototype only: do not build*.

| Search for | Because |
|---|---|
| `type="number"` on any RM amount | Money fields are text with a decimal keypad. (Day-of-month, months, years, percent and unit counts may be numeric.) |
| `navigator.onLine` | Wrong signal. |
| `order: -1` on an aside, or Today/outbox placed above the form on a phone | Form first. |
| `overflow: hidden` together with `100dvh` on the page or body | The page scrolls. |
| `::-webkit-scrollbar` with `display: none` | Scrollbars stay visible. |
| `preserveAspectRatio="none"` | Charts must keep their shape. |
| `font-size:9px`, `font-size:10px` (and any smaller) | 11 px floor. |
| A clock time such as `11:23` in any row or sample | Entries have no time. |
| `Synced`, `Online` as a permanent chip | Chip is hidden when fine. |
| `Face ID`, `fingerprint`, `biometric` | None exist. |
| `signs out all devices`, `Lock now (` | Wrong copy. |
| `#4a6560`, `#94a3b8` | Fail contrast. |
| `Add anyway` | Not a separate button. |
| `Good morning`, `v1.0.0` | Not available. |
| `AI advisor` | Not an AI. |
| A hard-coded list of categories in markup | Must come from the data object. |
| Two source-account controls in Transfer mode | Duplicate. |
| Any hex that is not in the token sheet and not a sample category colour | Keep to tokens. |
| Any README text from section 10.3's forbidden list | Stale. |

Also confirm by looking: a Transfer frame shows From, To, Date once; the Today list and outbox are below the form on a phone; the amount field is visible on a 390 × 844 screen; the light theme reads as mint-tinted.

---

## 12. Acceptance checklist and status table

At the end of each batch, send this table filled in for that batch. Allowed statuses: **Done** (visible in a named file and frame), **Partly** (say what is missing), **Not done** (say why). Add a "Questions" column entry where needed.

| ID | Requirement (short) | Batch |
|---|---|---|
| T-1 | Token sheet: Light and Dark values, existing names plus section 6.2 additions | B1 |
| T-2 | Contrast matrix computed for every pair in 6.4, including rgba blends | B1 |
| T-3 | Theme-specific tokens (hero, hero-danger, shadows, focus, overlay) | B1 |
| T-4 | Type, spacing and radius scales; 11 px floor | B1 |
| X-1…X-8 | Component sheet: inputs; buttons; banners; chips/tabs/segmented; accordions; dialogs; empty states; skeletons (every state, both themes) | B1 |
| SH-1 | Phone shell and nav states | B1 |
| SH-2 | Desktop shell and sidebar states | B1 |
| SH-3 | Status chip variants (hidden when fine) | B1 |
| SH-4 | Sync banner: five rows, stacking with 0 / 1 / 3 | B1 |
| SH-5 | Waiting to send: 1, 3, failed, mixed, being edited | B1 |
| SH-6 | Fallback page | B1 |
| R-1 | README rewritten; no forbidden text | B1 (skeleton), final in B8 |
| R-2 | Bundle consistent; stale files updated or removed | B1, re-check in B8 |
| ADD-1 | Add layout, phone and desktop order | B2 |
| ADD-2 | Fields per type; Transfer shows From/To/Date once | B2 |
| ADD-3 | Category tiles: colour, check, long names, Show all (N = 6, 9, 14, 22) | B2 |
| ADD-4 | Form states: empty, suggestions, saving, errors, four saved wordings | B2 |
| ADD-5 | Already-in-your-books warning, five cases | B2 |
| ADD-6 | Correcting a waiting entry | B2 |
| ADD-7 | Edit mode, delete dialog, PC-unreachable message | B2 |
| ADD-8 | Safe-to-spend: five variants, compact and full | B2 |
| ADD-9 | Account chips; Today list and empty | B2 |
| ACT-1…5 | Activity: header and period; search and filters; totals; groups and rows; pagination and empty | B3 |
| PLN-1…5 | Salary card; bills checklist; Mark paid; payday plan and variants; savings check and variants | B4 |
| BIL-1 | Manage bills list and form | B4 |
| SHR-1…3 | Shared page frame; card A with grid; card B with grid, prompts and planner | B4 |
| DSH-1…9 | Dashboard header, KPIs, empty, where it went, pace, income vs spending, NWS, budgets, top items | B5 |
| INS-1…4 | Insights headline, cash, findings, habit and recurring | B6 |
| INV-1…7 | Invest header and KPIs, savings, advisor, growth, holdings, add form, empty | B6 |
| SET-1…7 | Settings tabs, accounts, categories (with colour), payday, investing, data, appearance | B7 |
| IMP-1…6 | Import: choose file, column mapper, review summary and alerts, line cards, commit bar, done | B8 |
| LOG-1…3 | Login design, states, frames | B8 |
| PWA-1…2 | Drawn icon; theme colours | B8 |

---

## 13. Questions you may have (already answered)

- **Can I make Light neutral grey like the current app?** No (O-1). Keep it mint-tinted and fix the contrast.
- **Can I add a tertiary text colour?** Only if it passes 4.5:1 on every surface it sits on. The default answer is no.
- **Why no swipe, and why single-select filters?** The app has no gesture handling and the server filters one value at a time. Both are in-scope for the future, not for this round.
- **May Light and Dark differ in layout?** Only through tokens. If you believe a layout difference is needed, say what and why in your questions.
- **Can the hero card be a gradient in Light?** Yes, if it passes contrast (6.4) and is expressed through the `--hero-*` tokens.
- **May I show the amount of time since the PC was last reachable?** Yes, inside the offline banner row (7.3-B4). Not as a permanent chip.
- **May I invent a screen the brief doesn't list?** No. Ask in the status table.
- **A screen is dense: may I simplify?** You may reorder and restyle freely. You may not remove a state, a field or a message listed here.

---

## Appendix A: what the app uses today (reference, **not a target**)

| Token | Dark (today) | Light (today) |
|---|---|---|
| `--background` | `#0b1210` | `#f5f7f6` |
| `--foreground` | `#e6efeb` | `#0f1f1a` |
| `--card` | `#121c18` | `#ffffff` |
| `--muted` | `#8fa39b` | `#64748b` |
| `--line` | `#22312b` | `#e2e8e5` |
| `--accent` / `--accent-fg` | `#34d399` / `#052e1f` | `#047857` / `#ffffff` |
| `--accent-soft` | `#10392b` | `#d6f1e5` |
| `--danger` / `--danger-soft` | `#f87171` / `#3a1717` | `#b91c1c` / `#fde4e4` |
| `--warn` / `--warn-soft` | `#fbbf24` / `#3a2c0c` | `#b45309` / `#fdecc8` |
| `--income` | `#34d399` | `#047857` |
| `--series-1 / 2 / 3 / gray` | `#3987e5 / #d95926 / #199e70 / #56605b` | `#2a78d6 / #eb6834 / #1baf7a / #b9bdb8` |

v1's Light direction (the one O-1 keeps): page `#f0faf5`, borders `#c6f0db`, soft accent `#d1fae5`, nested surface `#f8fdf9`. Starting points only: adjust as needed to pass 6.4.

## Appendix B: contrast measured in v1 and v2

See 6.4. Additional v2 claims that were wrong when computed: light accent on white was listed as 7.2 (actually 5.5); light danger on white 6.2 (6.5); dark warn on its soft background 5.4 (8.1); light foreground on white 19.2 (17.1); dark foreground on card 14.2 (13.7). Recompute everything; do not copy figures.

## Appendix C: Lucide icons already in the app

`Wallet`, `Settings`, `Settings2`, `PlusCircle`, `ListOrdered`, `CalendarCheck`, `BarChart3`, `Lightbulb`, `PiggyBank`, `Users`, `FileUp`, `Download`, `Search`, `ChevronLeft`, `ChevronRight`, `ShieldCheck`, `AlertTriangle` / `TriangleAlert`, `CloudOff`, `RefreshCw`, `RotateCw`, `Check`, `CheckCircle2`, `X`, `Pencil`, `Trash2`, `Lock`, `Loader2`, `ArrowRightLeft`, `ArrowUpRight`, `ArrowDownRight`, `Minus`, `Circle`, `HandCoins`, `CalendarClock`, `ArrowRight`. Prefer these; name any new icon you add.

## Appendix D: glossary

- **Pay cycle**: the period from one payday to the next; the app's "month".
- **Spending / Savings account (role)**: the two accounts that give the Plan page its meaning: where salary lands and bills are paid, and the emergency fund.
- **Safe to spend**: money in the spending account minus the bills it still has to pay before the next payday.
- **Planning gap**: money drawn back from savings because the payday split left too little for bills.
- **Outbox / Waiting to send**: entries typed on the phone that the PC does not have yet.
- **Lookalike**: an entry the bank import already holds for the same amount around the same date.
- **In turns**: a shared bill where one person pays the whole month, rotating.
- **Held / hold**: a card pre-authorisation that is refunded; the importer cancels these out.
- **Role, nature, purpose**: nature (need / want / saving) belongs to categories; role (spending / savings) belongs to accounts.
