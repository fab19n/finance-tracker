import { shiftMonth } from "@/lib/dates";
import { normalizeName } from "./bills";

/**
 * Shared bills. Netflix is split four ways and Spotify six; people pay you back in whatever lumps suit them (one month,
 * three, six), so there is no tidy "paid on the 5th" to tick off. The model that makes every case fall out:
 *
 *   - each person owes their part of EVERY month the bill was actually charged, from the month they joined to the month
 *     they left. Their part is a fixed fraction of the bill (`share` / its usual amount), applied to what the bill was
 *     charged THAT month, so a price rise changes only the months from when it took effect;
 *   - a payment is valued at the price in force when it was made, and covers whole months at that price, oldest month
 *     first. What is left over after whole months (a few sen, or a part month) is then spread over the months still short,
 *     oldest first.
 *
 * So RM 133.50 from someone who owes RM 22.25 a month is six months paid, and RM 30.90 against a RM 5.15 share (a
 * Spotify turn) is six months too. Someone who prepaid twelve months at the old price has Nov and Dec part paid when the
 * price rises in Nov: what is still missing on each month is what they owe. With one price throughout this is exactly
 * "every month costs `share`, and money fills the oldest months first". A pure function: months, charges and payments in, a
 * ledger per person out.
 */

export type ShareDef = {
  id: number;
  billId: number;
  name: string;
  /** Sen they owe per month. */
  share: number;
  /** 'YYYY-MM' of the first month they take part. */
  startMonth: string;
  /** 'YYYY-MM' of the last month, once they have left; null while they still share. */
  endMonth: string | null;
  matchKeywords: string | null;
  active: boolean;
};

export type SharePayment = { shareId: number; txId: number; date: string; amount: number };

export type MonthCell = {
  month: string;
  state: "paid" | "partial" | "unpaid";
  /** Sen of their payments that landed on this month. */
  paid: number;
  /** What the month costs this person: their part of what the bill was charged that month. */
  cost: number;
  /** cost - paid, never negative: what is still missing for this month. */
  remaining: number;
  /** The bill has not been charged for this month yet: `cost` is what it will be if the price stays as it is. */
  upcoming: boolean;
};

/**
 * What the bill was charged, month by month. A person's part of a month is `share` x that month's charge / `typical`
 * (their fraction of the bill), so Netflix at RM 88.90 then RM 99.70 costs a quarter of each, not RM 24.93 throughout.
 */
export type PriceHistory = {
  /** Sen charged in each 'YYYY-MM' (several charges in a month add up). */
  charges: Map<string, number>;
  /** The bill's usual amount now: what `share` was set against, and what a month not charged yet is expected to cost. */
  typical: number;
};

export type PersonLedger = {
  share: ShareDef;
  /** Every month the bill was charged while they took part, oldest first. */
  cells: MonthCell[];
  /** Months not charged yet that they have already started paying for, oldest first. */
  upcoming: MonthCell[];
  /** Sen charged to them so far (their part of every charged month). */
  owed: number;
  /** Sen they have sent you. */
  paid: number;
  /**
   * owed - paid: positive = they owe you, negative = they have paid ahead. It is the NET position: after a price rise
   * someone can be "ahead" overall and still owe for a month they paid at the old price. `owedNow` is what they owe.
   */
  balance: number;
  /** Sen still missing on months that have been charged: what they owe you now. */
  owedNow: number;
  /** Sen still missing on months not charged yet that they have started paying for: owed once those months are charged. */
  expectedNext: number;
  /** Sen they have paid into months not charged yet. */
  aheadPaid: number;
  /** The last month of the run of fully covered months from the start. A future month when they have paid ahead. Null if none. */
  paidThrough: string | null;
  status: "settled" | "owes" | "ahead";
  /** Charged months not yet fully covered (a part-paid month counts). */
  monthsOwed: number;
  /** Whole months paid beyond what has been charged. */
  monthsAhead: number;
  lastPayment: { date: string; amount: number } | null;
};

/** The distinct 'YYYY-MM' months in which the bill was charged, oldest first. */
export function billedMonths(chargeDates: string[]): string[] {
  return [...new Set(chargeDates.map((d) => d.slice(0, 7)))].sort();
}

/** Every 'YYYY-MM' from `from` to `to`, inclusive (empty if `to` is before `from`). */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 600; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

/**
 * The months a person owes for: EVERY calendar month from when they joined to the latest month the bill was charged
 * (or until they left). Filling the gaps matters for a monthly subscription: a charge that posts a day late must not
 * make a month vanish, and someone whose first payment covered months from BEFORE your records start (Netflix paid
 * "Oct25 to Mar26" while your data begins in January) is still owed those months against.
 */
export function owedMonths(def: Pick<ShareDef, "startMonth" | "endMonth">, billed: string[]): string[] {
  const latest = billed[billed.length - 1];
  if (!latest) return [];
  const to = def.endMonth !== null && def.endMonth < latest ? def.endMonth : latest;
  return monthRange(def.startMonth, to);
}

/** The most months a payment is followed into the future (a year of shares paid in advance is already a lot). */
const MAX_UPCOMING = 120;

/**
 * What one month costs this person. With no price history it is `share` for every month. With one, it is their fraction of
 * what the bill was charged that month: a month with no charge uses the nearest earlier charged month (the first known one
 * before the records start), and a month after the latest charge costs the bill's usual amount.
 */
function monthAmounts(def: Pick<ShareDef, "share">, price?: PriceHistory): (month: string) => number {
  const share = Math.max(0, def.share);
  if (!price || price.typical <= 0 || share === 0 || price.charges.size === 0) return () => share;
  const known = [...price.charges.keys()].sort();
  const latest = known[known.length - 1];
  return (month) => {
    let charge = price.typical;
    if (month <= latest) charge = price.charges.get(known.filter((m) => m <= month).pop() ?? known[0])!;
    return Math.round((charge * share) / price.typical);
  };
}

export function personLedger(def: ShareDef, billed: string[], payments: SharePayment[], price?: PriceHistory): PersonLedger {
  const months = owedMonths(def, billed);
  const mine = payments
    .filter((p) => p.shareId === def.id)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.txId - b.txId));
  const paid = mine.reduce((s, p) => s + p.amount, 0);
  const share = Math.max(0, def.share);
  const costOf = monthAmounts(def, price);

  const cell = (month: string, upcoming: boolean): MonthCell => ({ month, state: "unpaid", paid: 0, cost: costOf(month), remaining: 0, upcoming });
  const cells = months.map((m) => cell(m, false));
  const upcoming: MonthCell[] = [];
  // Past the last charged month the months run on from it (or from the month before they joined, if none was charged yet).
  const lastCharged = months.length ? months[months.length - 1] : shiftMonth(def.startMonth, -1);
  const at = (i: number): MonthCell | null => {
    if (i < cells.length) return cells[i];
    const j = i - cells.length;
    if (j >= MAX_UPCOMING) return null;
    while (upcoming.length <= j) upcoming.push(cell(shiftMonth(lastCharged, upcoming.length + 1), true));
    return upcoming[j];
  };

  if (share > 0) {
    // 1. A payment covers whole months at the price in force when it was made, oldest month first. A month that costs less
    //    than the money given for it keeps its cost and passes the surplus on; one that costs more is left part paid.
    let loose = 0; // money not yet placed on a month: remainders and surpluses
    let next = 0;
    for (const p of mine) {
      const unit = costOf(p.date.slice(0, 7));
      const whole = unit > 0 ? Math.floor(p.amount / unit) : 0;
      loose += p.amount - whole * unit;
      for (let k = 0; k < whole; k++) {
        const c = at(next++);
        if (!c) {
          loose += unit;
          continue;
        }
        const take = Math.min(unit, c.cost);
        c.paid += take;
        loose += unit - take;
      }
    }
    // 2. What is left over finishes the months that are still short, oldest first.
    for (let i = 0; loose > 0; i++) {
      const c = at(i);
      if (!c) break;
      const take = Math.min(Math.max(0, c.cost - c.paid), loose);
      c.paid += take;
      loose -= take;
    }
  }

  const finish = (c: MonthCell) => {
    c.remaining = Math.max(0, c.cost - c.paid);
    c.state = c.paid <= 0 ? "unpaid" : c.paid >= c.cost ? "paid" : "partial";
  };
  cells.forEach(finish);
  // Only months somebody has paid into are worth showing ahead of the charge.
  const ahead = upcoming.filter((c) => c.paid > 0);
  ahead.forEach(finish);

  const owed = cells.reduce((s, c) => s + c.cost, 0);
  const owedNow = cells.reduce((s, c) => s + c.remaining, 0);
  const expectedNext = ahead.reduce((s, c) => s + c.remaining, 0);
  const aheadPaid = ahead.reduce((s, c) => s + c.paid, 0);

  // "Paid through" is where the unbroken run of fully covered months from the start ends: it runs on into months that
  // have not been charged yet when they have paid ahead.
  let paidThrough: string | null = null;
  for (const c of [...cells, ...ahead]) {
    if (c.state !== "paid") break;
    paidThrough = c.month;
  }

  const newest = [...mine].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.txId - a.txId))[0];
  return {
    share: def,
    cells,
    upcoming: ahead,
    owed,
    paid,
    balance: owed - paid,
    owedNow,
    expectedNext,
    aheadPaid,
    paidThrough,
    // Owing for a charged month wins over being ahead overall: money paid at an old price may not cover a dearer month.
    status: owedNow > 0 ? "owes" : paid > owed ? "ahead" : "settled",
    monthsOwed: cells.filter((c) => c.remaining > 0).length,
    monthsAhead: ahead.filter((c) => c.state === "paid").length,
    lastPayment: newest ? { date: newest.date, amount: newest.amount } : null,
  };
}

export type SharedBill<B extends { id: number }> = {
  bill: B;
  /** Every month the bill has been charged, oldest first. */
  months: string[];
  people: PersonLedger[];
  /** Months not charged yet that somebody has already paid into (the grid shows them after the charged months). */
  upcomingMonths: string[];
  /** Sen others owe you right now, for months that have been charged (money paid ahead is not netted off against it). */
  owedToYou: number;
  /** Sen others have paid into months not charged yet. */
  paidAhead: number;
  /** Sen still missing on those months not charged yet: owed once they are, if the price stays as it is. */
  expectedNext: number;
  /** What the bill costs you each month once the people still sharing pay their part, given its usual amount. */
  yourMonthlyCost: number;
  /** For a bill paid in turns: whose month is whose, and who has paid theirs. Then `people` and `months` are empty. */
  rotation: Rotation | null;
};

/**
 * `charges` (what the bill was charged each month) lets a price rise count only from the month it took effect; without it
 * every month costs each person their `share`.
 */
export function sharedBill<B extends { id: number }>(
  bill: B,
  typicalAmount: number,
  billed: string[],
  defs: ShareDef[],
  payments: SharePayment[],
  charges?: Map<string, number>,
): SharedBill<B> {
  const price = charges ? { charges, typical: typicalAmount } : undefined;
  const people = defs.map((d) => personLedger(d, billed, payments, price));
  const stillSharing = defs.filter((d) => d.active && d.endMonth === null).reduce((s, d) => s + d.share, 0);
  // The months worth showing: from the earliest anyone joined to the latest charge.
  const first = defs.map((d) => d.startMonth).sort()[0];
  return {
    bill,
    months: first && billed.length ? monthRange(first, billed[billed.length - 1]) : [],
    people,
    upcomingMonths: [...new Set(people.flatMap((p) => p.upcoming.map((c) => c.month)))].sort(),
    owedToYou: people.reduce((s, p) => s + p.owedNow, 0),
    paidAhead: people.reduce((s, p) => s + p.aheadPaid, 0),
    expectedNext: people.reduce((s, p) => s + p.expectedNext, 0),
    yourMonthlyCost: Math.max(0, typicalAmount - stillSharing),
    rotation: null,
  };
}

/** A bill paid in turns, in the same shape: what is owed is the turns that have come round and aren't paid. */
export function rotationBill<B extends { id: number }>(bill: B, typicalAmount: number, rotation: Rotation): SharedBill<B> {
  const yours = rotation.schedule.filter((s) => s.who === "you").length;
  return {
    bill,
    months: [],
    people: [],
    upcomingMonths: [],
    owedToYou: rotation.owedToYou,
    paidAhead: 0,
    expectedNext: 0,
    // On average, you pay for your own months only.
    yourMonthlyCost: rotation.schedule.length ? Math.round((typicalAmount * yours) / rotation.schedule.length) : typicalAmount,
    rotation,
  };
}

// ---- turns: one person pays the WHOLE month, in rotation ---------------------------------------------------------------

/**
 * Spotify is not shared "RM 5.15 a month each". It is paid in turns: in every six-month cycle you take the first month,
 * and each of the five others takes one of the rest and pays the whole RM 30.90 for it. A person's payment settles THEIR
 * turn, not six calendar months, so reading it as "a sixth of every month" (the monthly model above) puts people months
 * "ahead" that they never owed, and others behind for months that were never theirs.
 *
 * `schedule` says whose turn each month is. Everything someone sends is applied to their OWN turns, oldest first.
 */

/** Anyone paying within this much of what a turn costs counts as having paid it: friends round (RM 30 for RM 30.90). */
export const TURN_TOLERANCE = 100;

/** Whose turn a month is: a person's id, or "you". */
export type TurnWho = number | "you";
export type TurnSlot = { month: string; who: TurnWho };

export type TurnCell = {
  month: string;
  /** paid, part (some of it), due (their month has come and nothing is in), upcoming (still to come). */
  state: "paid" | "part" | "due" | "upcoming";
  /** Sen the month costs: what the bill was charged that month, or its usual amount. */
  due: number;
  /** Sen of this person's payments that landed on this turn. */
  paid: number;
  /** Sen missing from a turn that counts as paid anyway (RM 30 sent for a RM 30.90 month). */
  short: number;
  /** When the money for this turn arrived. */
  paidOn: string[];
};

export type TurnPerson = {
  share: ShareDef;
  /** Their turns on the plan, oldest first. */
  turns: TurnCell[];
  /** Sen still unpaid for turns that have come round (this month or earlier). */
  owes: number;
  /** Their first turn that isn't paid yet. */
  next: TurnCell | null;
  /** Sen they sent that no turn on the plan took (a payment for a month that isn't planned). */
  unmatched: number;
  /** The same money payment by payment: each is a month somebody covered that is not on the plan yet. */
  leftovers: { txId: number; date: string; amount: number }[];
  lastPayment: { date: string; amount: number } | null;
};

export type Rotation = {
  schedule: TurnSlot[];
  people: TurnPerson[];
  /** Turns that have come round and are not paid, oldest first. */
  dueNow: { month: string; shareId: number; amount: number }[];
  owedToYou: number;
  unmatched: number;
  /** The months the bill was actually charged (so a month that is YOURS, and charged to you, is paid). */
  charged: string[];
};

export function rotationLedger(opts: { schedule: TurnSlot[]; defs: ShareDef[]; payments: SharePayment[]; dueFor: (month: string) => number; today: string; charged?: string[] }): Rotation {
  const thisMonth = opts.today.slice(0, 7);
  const schedule = [...opts.schedule].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  const settled = (c: TurnCell) => c.paid >= c.due - TURN_TOLERANCE;

  const people: TurnPerson[] = opts.defs.map((def) => {
    const turns: TurnCell[] = schedule
      .filter((s) => s.who === def.id)
      .map((s) => ({ month: s.month, state: "upcoming", due: opts.dueFor(s.month), paid: 0, short: 0, paidOn: [] }));
    const mine = opts.payments.filter((p) => p.shareId === def.id).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.txId - b.txId));
    let unmatched = 0;
    const leftovers: TurnPerson["leftovers"] = [];
    for (const p of mine) {
      let left = p.amount;
      for (const c of turns) {
        if (settled(c)) continue;
        const take = Math.min(left, c.due - c.paid);
        if (take > 0) {
          c.paid += take;
          c.paidOn.push(p.date);
          left -= take;
        }
        if (left <= 0) break;
      }
      // Under a ringgit left over is rounding, not another month somebody covered.
      if (left >= TURN_TOLERANCE) {
        unmatched += left;
        leftovers.push({ txId: p.txId, date: p.date, amount: left });
      }
    }
    for (const c of turns) {
      c.short = settled(c) ? Math.max(0, c.due - c.paid) : 0;
      c.state = settled(c) ? "paid" : c.paid > 0 ? "part" : c.month <= thisMonth ? "due" : "upcoming";
    }
    const newest = [...mine].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.txId - a.txId))[0];
    return {
      share: def,
      turns,
      owes: turns.filter((c) => c.month <= thisMonth && !settled(c)).reduce((s, c) => s + (c.due - c.paid), 0),
      next: turns.find((c) => !settled(c)) ?? null,
      unmatched,
      leftovers,
      lastPayment: newest ? { date: newest.date, amount: newest.amount } : null,
    };
  });

  const dueNow = people
    .flatMap((p) => p.turns.filter((c) => c.month <= thisMonth && c.state !== "paid").map((c) => ({ month: c.month, shareId: p.share.id, amount: c.due - c.paid })))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.shareId - b.shareId));
  return { schedule, people, dueNow, owedToYou: dueNow.reduce((s, d) => s + d.amount, 0), unmatched: people.reduce((s, p) => s + p.unmatched, 0), charged: [...(opts.charged ?? [])].sort() };
}

/**
 * The months worth showing: your two latest cycles. A cycle starts with a month that is yours, so the window runs from
 * the cycle before the current one to the end of the current one (six months a cycle). With none of your months on the
 * plan, six months either side of today.
 */
export function rotationWindow(schedule: TurnSlot[], thisMonth: string, cycleLength = 6): string[] {
  const yours = schedule.filter((s) => s.who === "you").map((s) => s.month).sort();
  const current = [...yours].reverse().find((m) => m <= thisMonth);
  if (!current) return monthRange(shiftMonth(thisMonth, -cycleLength), shiftMonth(thisMonth, cycleLength - 1));
  const before = [...yours].reverse().find((m) => m < current);
  const from = before && before >= shiftMonth(current, -2 * cycleLength) ? before : shiftMonth(current, -cycleLength);
  return monthRange(from, shiftMonth(current, cycleLength - 1));
}

// ---- recognising a person's payment on a bank line ----------------------------------------------------------------

/**
 * Does this bank line name this person? The words you gave are matched anywhere ("kugan" finds KUGANESH A/L ...).
 * With none given, their name must appear as whole words, so "Ali" is not found inside "Kalidas".
 */
export function descriptionMatchesShare(s: Pick<ShareDef, "name" | "matchKeywords">, description: string): boolean {
  const d = normalizeName(description);
  const given = (s.matchKeywords ?? "").split(",").map((w) => normalizeName(w)).filter(Boolean);
  if (given.length) return given.some((kw) => d.includes(kw));
  const name = normalizeName(s.name);
  return name.length >= 3 && ` ${d} `.includes(` ${name} `);
}

/**
 * Which person (if any) sent this money? Among the people whose words appear on the line, prefer the one whose monthly
 * share divides the amount (a lump of whole months); if that still leaves two (one friend in both your Netflix and
 * your Spotify), say nothing rather than guess. A share that was lower before a price rise (`earlierShares`) counts too:
 * a lump of months at the old price is still a lump of whole months.
 */
export function pickShare<S extends Pick<ShareDef, "name" | "matchKeywords" | "share" | "active"> & { earlierShares?: number[] }>(shares: S[], description: string, amount: number): S | null {
  const hits = shares.filter((s) => s.active && descriptionMatchesShare(s, description));
  if (hits.length <= 1) return hits[0] ?? null;
  const whole = hits.filter((s) => [s.share, ...(s.earlierShares ?? [])].some((v) => v > 0 && amount % v === 0));
  return whole.length === 1 ? whole[0] : null;
}

/**
 * The amounts a person's month has cost other than today's `share`, from what the bill was charged in each month. Used to
 * recognise a lump of months paid at an old price.
 */
export function earlierShareAmounts(share: number, price: PriceHistory): number[] {
  if (share <= 0 || price.typical <= 0) return [];
  return [...new Set([...price.charges.values()].map((c) => Math.round((c * share) / price.typical)))].filter((v) => v > 0 && v !== share);
}

/** Categories whose money-in might be a friend's payment. Anything else (salary, interest...) clearly is not. */
export const SHARE_CANDIDATE_CATEGORIES = ["Reimbursements", "Other Income", "Gift Received"];
