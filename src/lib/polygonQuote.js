// ============================================
// UPTIKALERTS — polygonQuote.js
// Shared Polygon price/quote + ticker name utility
// Replaces all FMP quote calls across the app
// ============================================

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;
const BASE = 'https://api.polygon.io';

// ── Caches ──
const priceCache = {};   // { NVDA: { data, ts } }
const nameCache = {};    // { NVDA: 'Nvidia Corp' }
const CACHE_TTL = 60_000; // 60 seconds

/**
 * Fetch a single ticker's live price snapshot.
 * Returns { price, change, changePct, name } or null on error.
 * Caches for 60s.
 */
export async function getTickerQuote(ticker) {
  const now = Date.now();
  if (priceCache[ticker] && now - priceCache[ticker].ts < CACHE_TTL) {
    return priceCache[ticker].data;
  }
  try {
    const res = await fetch(
      `${BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_KEY}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const t = json.ticker;
    if (!t) return null;

    // Fetch company name if not cached
    let name = nameCache[ticker];
    if (!name) {
      name = await fetchTickerName(ticker);
    }

    const d = {
      price: t.day?.c ?? t.prevDay?.c ?? 0,
      change: t.todaysChange ?? 0,
      changePct: t.todaysChangePerc ?? 0,
      name: name || ticker,
    };
    priceCache[ticker] = { data: d, ts: now };
    return d;
  } catch {
    return null;
  }
}

/**
 * Fetch multiple tickers' price snapshots in a single batch call.
 * Returns a map: { NVDA: { price, change, changePct, name }, ... }
 */
export async function getBatchQuotes(tickers) {
  if (!tickers || tickers.length === 0) return {};
  const now = Date.now();

  // Split into cached vs uncached
  const result = {};
  const uncached = [];
  for (const t of tickers) {
    if (priceCache[t] && now - priceCache[t].ts < CACHE_TTL) {
      result[t] = priceCache[t].data;
    } else {
      uncached.push(t);
    }
  }
  if (uncached.length === 0) return result;

  try {
    const res = await fetch(
      `${BASE}/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${uncached.join(',')}&apiKey=${POLYGON_KEY}`
    );
    if (!res.ok) return result;
    const json = await res.json();

    // Fetch names for any we don't have cached
    const namePromises = uncached
      .filter(t => !nameCache[t])
      .map(t => fetchTickerName(t));
    await Promise.all(namePromises);

    (json.tickers || []).forEach(t => {
      const d = {
        price: t.day?.c ?? t.prevDay?.c ?? 0,
        change: t.todaysChange ?? 0,
        changePct: t.todaysChangePerc ?? 0,
        name: nameCache[t.ticker] || t.ticker,
      };
      priceCache[t.ticker] = { data: d, ts: now };
      result[t.ticker] = d;
    });
  } catch {
    // Return whatever we have
  }
  return result;
}

/**
 * Fetch the company name for a ticker.
 * Caches indefinitely (names don't change).
 */
async function fetchTickerName(ticker) {
  if (nameCache[ticker]) return nameCache[ticker];
  try {
    const res = await fetch(
      `${BASE}/v3/reference/tickers/${ticker}?apiKey=${POLYGON_KEY}`
    );
    if (!res.ok) return ticker;
    const json = await res.json();
    const name = json.results?.name || ticker;
    nameCache[ticker] = name;
    return name;
  } catch {
    return ticker;
  }
}

/**
 * Search tickers by query string.
 * Returns array of { symbol, name }.
 */
export async function searchTickers(query, limit = 8) {
  try {
    const res = await fetch(
      `${BASE}/v3/reference/tickers?search=${encodeURIComponent(query)}&active=true&market=stocks&locale=us&limit=${limit}&apiKey=${POLYGON_KEY}`
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results || []).map(r => ({
      symbol: r.ticker,
      name: r.name,
    }));
  } catch {
    return [];
  }
}
