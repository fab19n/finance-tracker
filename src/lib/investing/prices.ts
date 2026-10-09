/**
 * Optional price lookup. Best-effort only: both sources are free and unofficial/keyless, so every
 * function throws a friendly Error on failure and the app falls back to manual value updates.
 *
 *  - Quotes: Yahoo Finance's public chart endpoint (symbols like VOO, SPY, CSPX.L).
 *  - FX:     Frankfurter (European Central Bank reference rates) for X -> MYR.
 */

export type Quote = {
  symbol: string;
  price: number; // in `currency` (major units, e.g. dollars)
  currency: string; // ISO code, e.g. USD
  asOf: string; // YYYY-MM-DD of the last trade
};

const TIMEOUT_MS = 10_000;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (personal-finance-tracker)", Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchQuote(symbol: string): Promise<Quote> {
  const sym = symbol.trim();
  if (!/^[A-Za-z0-9.^=-]{1,20}$/.test(sym)) throw new Error(`"${symbol}" doesn't look like a ticker symbol`);
  let json: unknown;
  try {
    json = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`);
  } catch (e) {
    throw new Error(`Couldn't reach the price service for ${sym} (${e instanceof Error ? e.message : "network error"})`);
  }
  const meta = (json as { chart?: { result?: { meta?: Record<string, unknown> }[] } })?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!meta || !Number.isFinite(price) || price <= 0) throw new Error(`No price found for ${sym}`);
  const t = Number(meta.regularMarketTime);
  return {
    symbol: sym.toUpperCase(),
    price,
    currency: String(meta.currency ?? "USD"),
    asOf: Number.isFinite(t) ? new Date(t * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  };
}

/** How many MYR one unit of `currency` buys. 1 for MYR. */
export async function fetchFxToMyr(currency: string): Promise<number> {
  const cur = currency === "GBp" ? "GBP" : currency.toUpperCase();
  if (cur === "MYR") return 1;
  let json: unknown;
  try {
    json = await getJson(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(cur)}&symbols=MYR`);
  } catch (e) {
    throw new Error(`Couldn't fetch the ${cur}→MYR exchange rate (${e instanceof Error ? e.message : "network error"})`);
  }
  const rate = Number((json as { rates?: { MYR?: number } })?.rates?.MYR);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`No ${cur}→MYR exchange rate available`);
  return rate;
}

/** units x price x fx -> sen. Handles pence-quoted London listings ("GBp"). */
export function holdingValueSen(units: number, quote: Quote, fxToMyr: number): number {
  const major = quote.currency === "GBp" ? quote.price / 100 : quote.price;
  return Math.round(units * major * fxToMyr * 100);
}
