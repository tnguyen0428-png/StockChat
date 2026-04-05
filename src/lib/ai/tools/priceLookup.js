const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;

const priceCache = new Map();
const CACHE_TTL = 60 * 1000; // 60 seconds

export async function lookupPrice(ticker) {
  const upper = ticker.toUpperCase();
  const cached = priceCache.get(upper);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const res = await fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${upper}?apiKey=${POLYGON_KEY}`
    );
    const json = await res.json();
    const t = json.ticker;
    if (!t) return null;

    // Use today's data if market is open, fall back to prevDay when closed
    const hasToday = t.day?.c > 0 || t.lastTrade?.p > 0;
    const price = t.lastTrade?.p || t.day?.c || t.prevDay?.c || null;
    const prevClose = t.prevDay?.c || null;
    const change = hasToday ? t.todaysChange : null;
    const changePercent = hasToday ? t.todaysChangePerc : null;
    const volume = hasToday ? t.day?.v : t.prevDay?.v || null;
    const dayHigh = hasToday ? t.day?.h : t.prevDay?.h || null;
    const dayLow = hasToday ? t.day?.l : t.prevDay?.l || null;

    const data = {
      ticker: upper,
      price,
      change,
      changePercent,
      volume,
      dayHigh,
      dayLow,
      prevClose,
      marketOpen: hasToday,
    };

    console.log('[PriceLookup]', upper, ':', price ? `$${price}` : 'no data', hasToday ? '(live)' : '(prev close)');

    priceCache.set(upper, { data, ts: Date.now() });
    return data;
  } catch (err) {
    console.error('[PriceLookup] Failed for', upper, ':', err.message);
    return null;
  }
}
