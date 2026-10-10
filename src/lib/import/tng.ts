import { formatRM } from "@/lib/money";
import type { PositionedLine } from "./pdf-lines";
import type { BalanceCheck, ParsedStatement, StatementRow } from "./types";

/**
 * Touch 'n Go eWallet history: the "TNG WALLET TRANSACTION HISTORY" PDF the app e-mails you.
 *
 * It is a table turned on its side: every transaction is a COLUMN and every field a ROW (date at the bottom, then status,
 * type, reference, description, amount, balance). It has two tables, the wallet's, and GO+ (the savings pot the wallet
 * sweeps into, which pays a few sen of interest a day). Money slides between the two on its own ("Reload via GO+
 * Balance", "Cash out to GO+"), so for this app they are ONE account, and only the money that really enters or leaves
 * Touch 'n Go becomes a line:
 *
 *   DuitNow from your own accounts      -> money in   (already recorded from the bank's side: recognised as such)
 *   Payment (card reload, parking...)   -> money out
 *   Transfer to Wallet (to a friend)    -> money out
 *   GO+ daily interest                  -> one line for the whole statement
 *   wallet <-> GO+ moves, reversed payments with their cancellation -> nothing (they cancel out)
 *
 * The statement has no running balance for the combined account, so it is checked as a whole: where it started + every
 * line = where it ended, to the sen. A line of a kind it doesn't know is left out with a warning (and the check fails).
 */

const LABELS = new Set(["Date", "Status", "Transaction Type", "Reference", "Description", "Details", "Amount (RM)", "Wallet Balance", "GO+ Balance"]);
const DATE_CELL = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const MONEY_CELL = /^RM([\d,]+(?:\.\d+)?)$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Cell = { x: number; y: number; s: string };
type Raw = {
  table: "wallet" | "go";
  date: string;
  status: string;
  type: string;
  description: string;
  /** sen. Fractional for GO+ interest (RM 0.0014 a day). */
  amount: number;
  /** The table's own balance after this line, in sen. */
  balance: number | null;
};

export function looksLikeTngWallet(pages: PositionedLine[][]): boolean {
  return pages.some((p) => p.some((l) => /TNG WALLET TRANSACTION/i.test(l.text)));
}

const iso = (d: string) => {
  const m = d.match(DATE_CELL)!;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};
const sen = (s: string): number | null => {
  const m = s.match(MONEY_CELL);
  return m ? Number(m[1].replace(/,/g, "")) * 100 : null;
};
const label = (isoDate: string) => `${Number(isoDate.slice(8))} ${MONTHS[Number(isoDate.slice(5, 7)) - 1]} ${isoDate.slice(0, 4)}`;
const dayGap = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** Read every column of every table, in page order. */
function readColumns(pages: PositionedLine[][]): Raw[] {
  const out: Raw[] = [];
  let goSeen = false;
  for (const lines of pages) {
    const cells: Cell[] = lines.flatMap((l) => l.items.map((it) => ({ x: it.x, y: l.y, s: it.str.trim() }))).filter((c) => c.s && !LABELS.has(c.s));
    const anchors = cells.filter((c) => DATE_CELL.test(c.s)).sort((a, b) => a.x - b.x);
    if (!anchors.length) continue;
    // The dates all sit on one row; every other row is at a fixed distance from it.
    const dateY = Math.min(...anchors.map((a) => a.y));
    // Once the "GO+ TRANSACTION" heading has been seen, every column right of it on that page, and every column on the
    // pages after it, belongs to GO+.
    const headingX = lines.flatMap((l) => l.items).find((it) => /GO\+ TRANSACTION/.test(it.str))?.x;
    const goFrom = headingX ?? (goSeen ? -Infinity : Infinity);
    if (headingX !== undefined) goSeen = true;

    const ownerOf = (x: number) => {
      let best: Cell | null = null;
      for (const a of anchors) if (a.x <= x + 2) best = a;
      return best;
    };
    const cols = new Map<Cell, { status: Cell[]; type: Cell[]; desc: Cell[]; money: Cell[] }>(anchors.map((a) => [a, { status: [], type: [], desc: [], money: [] }]));
    for (const c of cells) {
      const owner = ownerOf(c.x);
      if (!owner || DATE_CELL.test(c.s)) continue;
      const col = cols.get(owner)!;
      const dy = c.y - dateY;
      if (MONEY_CELL.test(c.s)) col.money.push(c);
      else if (dy > 40 && dy < 90) col.status.push(c);
      else if (dy > 100 && dy < 155) col.type.push(c);
      else if (dy > 255 && dy < 315) col.desc.push(c);
    }
    const text = (xs: Cell[], sep: string) => xs.sort((p, q) => p.x - q.x).map((p) => p.s).join(sep).replace(/\s+/g, " ").trim();
    for (const a of anchors) {
      const col = cols.get(a)!;
      // Two amounts per column: the line's amount sits below the balance after it.
      const money = col.money.sort((p, q) => p.y - q.y);
      if (!money.length) continue;
      out.push({
        table: a.x >= goFrom ? "go" : "wallet",
        date: iso(a.s),
        status: text(col.status, " "),
        type: text(col.type, ""),
        description: text(col.desc, " "),
        amount: sen(money[0].s) ?? 0,
        balance: money.length > 1 ? Math.round(sen(money[money.length - 1].s) ?? 0) : null,
      });
    }
  }
  return out;
}

const CREDIT = /^(DUITNOW_RECEIVE|Payment Cancelled|Reload)/i;
const DEBIT = /^(Payment|eWallet Cash Out|Transfer to Wallet)/i;

export function parseTngWallet(pages: PositionedLine[][]): (ParsedStatement & { check: BalanceCheck }) | null {
  const raw = readColumns(pages);
  if (!raw.length) return null;
  const wallet = raw.filter((r) => r.table === "wallet");
  const go = raw.filter((r) => r.table === "go");

  // ---- where the combined account started and ended: each table's balance just before its first line and after its last
  const walletSigned = (r: Raw) => (CREDIT.test(r.type) ? r.amount : DEBIT.test(r.type) ? -r.amount : null);
  const goSigned = (r: Raw) => (/^GO\+ (Cash In|Daily Earnings)/i.test(r.type) ? r.amount : /^GO\+ Cash Out/i.test(r.type) ? -r.amount : null);
  const before = (rows: Raw[], signed: (r: Raw) => number | null): number | null => {
    if (!rows.length) return 0;
    const first = rows.find((r) => r.balance !== null);
    const s = first ? signed(first) : null;
    return first && s !== null ? Math.round(first.balance! - s) : null;
  };
  const after = (rows: Raw[]): number | null => (rows.length ? ([...rows].reverse().find((r) => r.balance !== null)?.balance ?? null) : 0);
  const wb = before(wallet, walletSigned), gb = before(go, goSigned);
  const wa = after(wallet), ga = after(go);
  const opening = wb !== null && gb !== null ? wb + gb : null;
  const closing = wa !== null && ga !== null ? wa + ga : null;

  // ---- the lines that really enter or leave Touch 'n Go
  type Flow = { date: string; description: string; amount: number };
  const flows: Flow[] = [];
  const unknown = new Map<string, number>();
  const note = (t: string) => unknown.set(t, (unknown.get(t) ?? 0) + 1);
  const reversed: Raw[] = [];
  const cancelled: Raw[] = [];
  const payment = (r: Raw) => (/^card reload$/i.test(r.description) ? "Touch 'n Go card reload" : r.description || "Touch 'n Go payment");

  for (const r of wallet) {
    const t = r.type.replace(/\s+/g, " ").trim();
    const amount = Math.round(r.amount);
    if (/^DUITNOW_RECEIVE/i.test(t)) flows.push({ date: r.date, description: `DUITNOW TRANSFER FROM ${r.description || "YOUR ACCOUNT"}`, amount });
    else if (/^Transfer to Wallet/i.test(t)) flows.push({ date: r.date, description: `Sent to ${r.description || "another wallet"}`, amount: -amount });
    else if (/^Payment Cancelled/i.test(t)) cancelled.push(r);
    else if (/^Payment/i.test(t)) {
      if (/^success/i.test(r.status)) flows.push({ date: r.date, description: payment(r), amount: -amount });
      else if (/revers/i.test(r.status)) reversed.push(r);
      else note(`Payment (${r.status || "no status"})`);
    } else if (/^Reload/i.test(t)) {
      // "Quick Reload Payment (via GO+ Balance)" moves money from GO+ into the wallet: not new money.
      if (!/GO\+/i.test(r.description)) flows.push({ date: r.date, description: `Touch 'n Go reload: ${r.description || "from a bank"}`, amount });
    } else if (/^eWallet Cash Out/i.test(t)) {
      if (!/GO\+/i.test(r.description)) flows.push({ date: r.date, description: `Touch 'n Go cash out: ${r.description || "to a bank"}`, amount: -amount });
    } else note(t);
  }
  // A payment the app reversed, and the credit that cancelled it, cancel out. One without the other (the two straddle
  // two statements) is real money moving, so it stays as a line.
  for (const c of cancelled) {
    const i = reversed.findIndex((r) => Math.round(r.amount) === Math.round(c.amount) && dayGap(r.date, c.date) <= 3);
    if (i >= 0) reversed.splice(i, 1);
    else flows.push({ date: c.date, description: `${c.description || "Payment"} (refund)`, amount: Math.round(c.amount) });
  }
  for (const r of reversed) flows.push({ date: r.date, description: `${payment(r)} (payment reversed)`, amount: -Math.round(r.amount) });

  // ---- GO+: its daily interest is a fraction of a sen a day, so it becomes ONE line; the rest is wallet <-> GO+ moves
  let earned = 0;
  for (const r of go) {
    const t = r.type.replace(/\s+/g, " ").trim();
    if (/^GO\+ Daily Earnings/i.test(t)) earned += r.amount;
    else if (/^GO\+ Cash (In|Out)/i.test(t) && /wallet/i.test(r.description)) continue;
    else note(t);
  }

  flows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); // stable: lines of one day keep the statement's order
  const dates = raw.map((r) => r.date).sort();
  const period = `${label(dates[0])} to ${label(dates[dates.length - 1])}`;
  const external = flows.reduce((s, f) => s + f.amount, 0);
  // What the interest must have been for the statement to end where it says it does. The bank rounds its balances to the
  // sen at every step, so this may differ from the sum of the daily fractions by a sen or two: accept that, no more.
  let interest = Math.round(earned);
  if (opening !== null && closing !== null) {
    const residual = closing - (opening + external);
    if (residual >= 0 && Math.abs(residual - earned) <= 2) interest = residual;
  }
  if (interest !== 0) flows.push({ date: dates[dates.length - 1], description: `GO+ interest ${period}`, amount: interest });

  let running = opening ?? 0;
  const rows: StatementRow[] = flows.map((f, index) => {
    running += f.amount;
    return { index, date: f.date, description: f.description, amount: f.amount, balance: opening === null ? null : running, signedBy: "hint" };
  });

  const known = opening !== null && closing !== null;
  const ok = known && running === closing;
  const warnings: string[] = [];
  if (unknown.size) warnings.push(`Left out ${[...unknown.values()].reduce((a, b) => a + b, 0)} line(s) of a kind I don't recognise: ${[...unknown].map(([t, n]) => `${t} (${n})`).join(", ")}.`);
  if (!known) warnings.push("I couldn't find where this wallet started and ended, so the lines can't be checked against its balance.");
  else if (!ok) warnings.push(`These lines take the wallet from ${formatRM(opening!)} to ${formatRM(running)}, but the statement ends at ${formatRM(closing!)}: compare them with the PDF before importing.`);

  return {
    rows,
    openingBalance: opening,
    closingBalance: closing,
    skipped: [],
    warnings,
    check: { checked: 0, matched: 0, mismatches: [], openingBalance: opening, openingVerified: ok, firstRowGuessed: false, total: known ? { opening: opening!, closing: closing!, ok } : undefined },
  };
}
