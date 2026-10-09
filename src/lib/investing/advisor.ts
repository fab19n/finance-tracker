import { formatRM } from "@/lib/money";
import type { AppSettings, RiskProfile } from "@/lib/settings";
import { futureValueLump, futureValueMonthly } from "./projection";

/**
 * "What should I do with my extra money?" - a transparent waterfall, not a black box.
 *
 *   1. Is there a surplus?             (average income - average spending)
 *   2. Is the emergency fund full?     (liquid cash vs N months of spending)
 *   3. How long can the money stay put? (horizon -> how much equity risk is sensible)
 *   4. Split the rest between FD / money-market and an S&P 500 index fund by risk profile.
 *
 * It returns structured numbers + plain-English steps. It is an educational model with editable
 * assumptions, not licensed financial advice - the UI says so.
 */

export type AdviceInput = {
  avgMonthlyIncome: number; // sen
  avgMonthlyExpense: number; // sen
  monthsOfData: number; // complete months the averages are based on
  liquid: number; // bank + cash + e-wallet, sen
  settings: AppSettings;
};

export type AdviceStep = {
  id: string;
  title: string;
  detail: string;
  tone: "warn" | "info" | "go";
};

export type Allocation = {
  fdPct: number;
  spPct: number;
  monthlyFd: number;
  monthlySp: number;
  lumpFd: number;
  lumpSp: number;
};

export type ProjectionPoint = { year: number; fd: number; sp: number; mix: number; contributed: number };

export type Advice = {
  ready: boolean;
  surplus: number;
  emergency: {
    target: number;
    have: number;
    gap: number;
    monthsCovered: number;
    funded: boolean;
    /** months of full surplus needed to close the gap, null when there's no surplus */
    monthsToFill: number | null;
  };
  /** Monthly amount available to invest once the emergency fund is full. */
  investableMonthly: number;
  /** One-off idle cash sitting above the safety net. */
  lumpSum: number;
  allocation: Allocation | null;
  steps: AdviceStep[];
  projection: {
    years: number;
    series: ProjectionPoint[];
    final: {
      contributed: number;
      fd: number;
      spLow: number;
      spExpected: number;
      spHigh: number;
      mixLow: number;
      mixExpected: number;
      mixHigh: number;
    };
    rates: { fd: number; spLow: number; spExpected: number; spHigh: number };
  } | null;
  notes: string[];
};

/** [FD %, S&P %] by risk profile and how long the money can stay invested. */
const SPLITS: Record<RiskProfile, { short: [number, number]; mid: [number, number]; long: [number, number] }> = {
  conservative: { short: [100, 0], mid: [80, 20], long: [60, 40] },
  balanced: { short: [100, 0], mid: [50, 50], long: [30, 70] },
  growth: { short: [90, 10], mid: [30, 70], long: [10, 90] },
};

export function splitFor(profile: RiskProfile, horizonYears: number): [number, number] {
  const s = SPLITS[profile];
  return horizonYears < 3 ? s.short : horizonYears <= 5 ? s.mid : s.long;
}

const SP_DOWNSIDE = 4; // pessimistic = expected - 4 points
const SP_UPSIDE = 3; // optimistic = expected + 3 points

export function buildAdvice(input: AdviceInput): Advice {
  const { avgMonthlyIncome: income, avgMonthlyExpense: expense, monthsOfData, liquid, settings } = input;
  const ready = monthsOfData >= 1 && income > 0;
  const surplus = Math.max(0, income - expense);

  const target = Math.round(settings.emergencyMonths * expense);
  const gap = Math.max(0, target - liquid);
  const funded = gap === 0;
  const emergency = {
    target,
    have: liquid,
    gap,
    monthsCovered: expense > 0 ? liquid / expense : 0,
    funded,
    monthsToFill: gap > 0 && surplus > 0 ? Math.ceil(gap / surplus) : null,
  };

  const notes = [
    "The S&P 500 is not guaranteed: it has fallen 30-50% in bad years. The expected rate is a long-run illustration before inflation, fees and tax.",
    `Fixed-deposit rates change. This page uses your assumption of ${settings.fdRatePct}% p.a. - check your bank's current offer in Settings.`,
    "US-listed S&P 500 ETFs (e.g. VOO, SPY) are commonly cited as carrying US dividend withholding tax for Malaysian residents and US estate-tax exposure above USD 60,000; Ireland-domiciled UCITS versions (e.g. CSPX, VUAA) are a common alternative. Confirm with your broker or a tax adviser.",
    "This is an educational model with editable assumptions, not licensed financial advice.",
  ];

  const base: Advice = {
    ready,
    surplus,
    emergency,
    investableMonthly: 0,
    lumpSum: 0,
    allocation: null,
    steps: [],
    projection: null,
    notes,
  };

  if (!ready) {
    base.steps.push({
      id: "need-data",
      tone: "info",
      title: "Log a full month first",
      detail:
        "The advisor works from your real income and spending. Record your salary and a month of expenses, and it will show how much you can safely invest.",
    });
    return base;
  }

  // Step 1: is there a surplus?
  if (surplus <= 0) {
    base.steps.push({
      id: "no-surplus",
      tone: "warn",
      title: "There's no surplus to invest yet",
      detail: `You spend about ${formatRM(expense)} a month against ${formatRM(income)} of income. Free up money first - open Insights to see where it leaks - then come back.`,
    });
  } else {
    base.steps.push({
      id: "surplus",
      tone: "info",
      title: `You keep about ${formatRM(surplus)} a month`,
      detail: `Average of the last ${monthsOfData} complete month${monthsOfData === 1 ? "" : "s"}: ${formatRM(income)} in, ${formatRM(expense)} out.`,
    });
  }

  // Step 2: emergency fund
  if (!funded) {
    base.steps.push({
      id: "emergency",
      tone: "warn",
      title: "Build your emergency fund first",
      detail:
        `You hold ${formatRM(liquid)}, about ${emergency.monthsCovered.toFixed(1)} months of spending; the goal is ${settings.emergencyMonths} months (${formatRM(target)}). ` +
        (emergency.monthsToFill
          ? `Sending the whole surplus there closes the ${formatRM(gap)} gap in about ${emergency.monthsToFill} month${emergency.monthsToFill === 1 ? "" : "s"}. `
          : "") +
        "Keep it somewhere safe and instantly accessible (savings account, or a short FD you can break) - not in shares.",
    });
  } else {
    base.steps.push({
      id: "emergency-ok",
      tone: "go",
      title: "Emergency fund: covered",
      detail: `${formatRM(liquid)} is ${emergency.monthsCovered.toFixed(1)} months of spending (goal ${settings.emergencyMonths}). Everything beyond this can work harder.`,
    });
  }

  // Idle cash above the safety net (keep one extra month as a float for upcoming bills).
  const lumpSum = funded ? Math.max(0, liquid - target - expense) : 0;
  const investableMonthly = surplus;

  const [fdPct, spPct] = splitFor(settings.riskProfile, settings.horizonYears);
  const horizon = settings.horizonYears;

  if (investableMonthly > 0 || lumpSum > 0) {
    if (lumpSum > 0) {
      base.steps.push({
        id: "lump",
        tone: "go",
        title: `${formatRM(lumpSum)} is sitting idle`,
        detail: "That's cash above your emergency fund plus one month of spending. Money in a current account loses value to inflation - invest it in the same split below.",
      });
    }
    base.steps.push({
      id: "split",
      tone: funded ? "go" : "info",
      title: `${funded ? "Split" : "Then split"}: ${fdPct}% fixed deposit / money-market, ${spPct}% S&P 500 index fund`,
      detail:
        (horizon < 3
          ? "Money you need within 3 years shouldn't ride the stock market, so it leans on the fixed deposit. "
          : horizon <= 5
            ? "A 3-5 year horizon can take some market swings but not a big one. "
            : "Over 5+ years the stock market has historically out-run deposits, so it gets the larger share. ") +
        `(${settings.riskProfile} profile, ${horizon}-year horizon - change both in Settings.)`,
    });
    base.steps.push({
      id: "dca",
      tone: "info",
      title: funded ? "Invest the same amount on the same day every month" : "When you start, invest the same amount every month",
      detail:
        "Don't try to time the market. A fixed monthly amount buys more units when prices are low and fewer when high (dollar-cost averaging) and removes the temptation to wait for a 'better' moment.",
    });

    const monthlyFd = Math.round((investableMonthly * fdPct) / 100);
    const lumpFd = Math.round((lumpSum * fdPct) / 100);
    base.allocation = {
      fdPct,
      spPct,
      monthlyFd,
      monthlySp: investableMonthly - monthlyFd,
      lumpFd,
      lumpSp: lumpSum - lumpFd,
    };
  }
  base.investableMonthly = investableMonthly;
  base.lumpSum = lumpSum;

  // Projection: the same cash, three ways (all FD, all S&P, your mix), each over the horizon.
  if (base.allocation) {
    const a = base.allocation;
    const rates = {
      fd: settings.fdRatePct,
      spLow: Math.max(0, settings.sp500ReturnPct - SP_DOWNSIDE),
      spExpected: settings.sp500ReturnPct,
      spHigh: settings.sp500ReturnPct + SP_UPSIDE,
    };
    const grow = (lump: number, monthly: number, rate: number, years: number) =>
      futureValueLump(lump, rate, years) + futureValueMonthly(monthly, rate, years);
    const mix = (rateSp: number, years: number) =>
      grow(a.lumpFd, a.monthlyFd, rates.fd, years) + grow(a.lumpSp, a.monthlySp, rateSp, years);

    const series: ProjectionPoint[] = [];
    for (let y = 0; y <= horizon; y++) {
      series.push({
        year: y,
        fd: grow(lumpSum, investableMonthly, rates.fd, y),
        sp: grow(lumpSum, investableMonthly, rates.spExpected, y),
        mix: mix(rates.spExpected, y),
        contributed: lumpSum + investableMonthly * 12 * y,
      });
    }
    base.projection = {
      years: horizon,
      series,
      rates,
      final: {
        contributed: lumpSum + investableMonthly * 12 * horizon,
        fd: grow(lumpSum, investableMonthly, rates.fd, horizon),
        spLow: grow(lumpSum, investableMonthly, rates.spLow, horizon),
        spExpected: grow(lumpSum, investableMonthly, rates.spExpected, horizon),
        spHigh: grow(lumpSum, investableMonthly, rates.spHigh, horizon),
        mixLow: mix(rates.spLow, horizon),
        mixExpected: mix(rates.spExpected, horizon),
        mixHigh: mix(rates.spHigh, horizon),
      },
    };
  }

  return base;
}
