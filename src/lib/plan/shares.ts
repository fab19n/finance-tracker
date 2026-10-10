import { shiftMonth } from "@/lib/dates";
import { normalizeName } from "./bills";

/**
 * Shared bills. Netflix is split four ways and Spotify six; people pay you back in whatever lumps suit them (one month,
 * three, six), so there is no tidy "paid on the 5th" to tick off. The model that makes every case fall out:
 *
 *   - each person owes `share` for EVERY month the bill was actually charged, from the month they joined to the month
 *     they left;
 *   - everything they send you is applied to their OLDEST unpaid month first.
 *
 * So RM 133.50 from someone who owes RM 22.25 a month is six months paid, and RM 30.90 against a RM 5.15 share (a
 * Spotify turn) is six months too. A pure function: months and payments in, a ledger per person out.
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
};

export type PersonLedger = {
  share: ShareDef;
  /** Every month the bill was charged while they took part, oldest first. */
  cells: MonthCell[];
  /** Sen charged to them so far (months x share). */
  owed: number;
  /** Sen they have sent you. */
  paid: number;
  /** owed - paid: positive = they owe you, negative = they have paid ahead. */
  balance: number;
  /** The last month fully covered. A future month when they have paid ahead. Null if none is covered yet. */
  paidThrough: string | null;
  status: "settled" | "owes" | "ahead";
  /** Months not yet fully covered (a part-paid month counts). */
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

export function personLedger(def: ShareDef, billed: string[], payments: SharePayment[]): PersonLedger {
  const months = owedMonths(def, billed);
  const mine = payments.filter((p) => p.shareId === def.id);
  const paid = mine.reduce((s, p) => s + p.amount, 0);
  const share = Math.max(0, def.share);

  const fullMonths = share > 0 ? Math.floor(paid / share) : 0;
  const remainder = share > 0 ? paid - fullMonths * share : 0;
  const cells: MonthCell[] = months.map((month, i) => {
    if (i < fullMonths) return { month, state: "paid", paid: share };
    if (i === fullMonths && remainder > 0) return { month, state: "partial", paid: remainder };
    return { month, state: "unpaid", paid: 0 };
  });

  const owed = months.length * share;
  const balance = owed - paid;

  let paidThrough: string | null = null;
  if (fullMonths > 0) {
    // Beyond the months charged so far, "paid through" runs on into months that have not been billed yet.
    const last = months.length ? months[months.length - 1] : shiftMonth(def.startMonth, -1);
    paidThrough = fullMonths <= months.length ? months[fullMonths - 1] : shiftMonth(last, fullMonths - months.length);
  }

  const newest = [...mine].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.txId - a.txId))[0];
  return {
    share: def,
    cells,
    owed,
    paid,
    balance,
    paidThrough,
    status: balance > 0 ? "owes" : balance < 0 ? "ahead" : "settled",
    monthsOwed: balance > 0 && share > 0 ? Math.ceil(balance / share) : 0,
    monthsAhead: balance < 0 && share > 0 ? Math.floor(-balance / share) : 0,
    lastPayment: newest ? { date: newest.date, amount: newest.amount } : null,
  };
}

export type SharedBill<B extends { id: number }> = {
  bill: B;
  /** Every month the bill has been charged, oldest first. */
  months: string[];
  people: PersonLedger[];
  /** Sen others owe you right now (people who have paid ahead are not netted off against those who owe). */
  owedToYou: number;
  /** Sen others have paid ahead of what has been charged. */
  paidAhead: number;
  /** What the bill costs you each month once the people still sharing pay their part, given its usual amount. */
  yourMonthlyCost: number;
  /** For a bill paid in turns: whose month is whose, and who has paid theirs. Then `people` and `months` are empty. */
  rotation: Rotation | null;
};

export function sharedBill<B extends { id: number }>(bill: B, typicalAmount: number, billed: string[], defs: ShareDef[], payments: SharePayment[]): SharedBill<B> {
  const people = defs.map((d) => personLedger(d, billed, payments));
  const stillSharing = defs.filter((d) => d.active && d.endMonth === null).reduce((s, d) => s + d.share, 0);
  // The months worth showing: from the earliest anyone joined to the latest charge.
  const first = defs.map((d) => d.startMonth).sort()[0];
  return {
    bill,
    months: first && billed.length ? monthRange(first, billed[billed.length - 1]) : [],
    people,
    owedToYou: people.reduce((s, p) => s + Math.max(0, p.balance), 0),
    paidAhead: people.reduce((s, p) => s + Math.max(0, -p.balance), 0),
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
    owedToYou: rotation.owedToYou,
    paidAhead: 0,
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
 * your Spotify), say nothing rather than guess.
 */
export function pickShare<S extends Pick<ShareDef, "name" | "matchKeywords" | "share" | "active">>(shares: S[], description: string, amount: number): S | null {
  const hits = shares.filter((s) => s.active && descriptionMatchesShare(s, description));
  if (hits.length <= 1) return hits[0] ?? null;
  const whole = hits.filter((s) => s.share > 0 && amount % s.share === 0);
  return whole.length === 1 ? whole[0] : null;
}

/** Categories whose money-in might be a friend's payment. Anything else (salary, interest...) clearly is not. */
export const SHARE_CANDIDATE_CATEGORIES = ["Reimbursements", "Other Income", "Gift Received"];
