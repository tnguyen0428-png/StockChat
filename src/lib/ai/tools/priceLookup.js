const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;

const priceCache = new Map();
const CACHE_TTL = 60 * 1000;

export async function lookupPrice(ticker) {
  const upper = ticker.toUpperCase();
  const cached = priceCache.get(upper);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  if (!POLYGON_KEY) {
    console.warn('[PriceLookup] No Polygon API key configured');
    return null;
  }

  // Try snapshot endpoint first (live/recent data)
  let data = null;
  try {
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${upper}?apiKey=${POLYGON_KEY}`;
    const res = await fetch(url);
    console.log('[PriceLookup]', upper, 'snapshot status:', res.status);

    if (res.ok) {
      const json = await res.json();
      const t = json.ticker;
      if (t) {
        const hasToday = t.day?.c > 0 || t.lastTrade?.p > 0;
        const price = t.lastTrade?.p || t.day?.c || t.prevDay?.c || null;
        if (price) {
          data = {
            ticker: upper,
            price,
            change: hasToday ? t.todaysChange : null,
            changePercent: hasToday ? t.todaysChangePerc : null,
            volume: hasToday ? t.day?.v : t.prevDay?.v || null,
            dayHigh: hasToday ? t.day?.h : t.prevDay?.h || null,
            dayLow: hasToday ? t.day?.l : t.prevDay?.l || null,
            prevClose: t.prevDay?.c || null,
            marketOpen: hasToday,
          };
        }
      }
    } else {
      const errText = await res.text().catch(() => '');
      console.error('[PriceLookup] Snapshot failed:', res.status, errText.substring(0, 200));
    }
  } catch (err) {
    console.error('[PriceLookup] Snapshot error for', upper, ':', err.message);
  }

  // If snapshot failed or returned no price, try previous day endpoint
  if (!data) {
    try {
      const prevUrl = `https://api.polygon.io/v2/aggs/ticker/${upper}/prev?apiKey=${POLYGON_KEY}`;
      const prevRes = await fetch(prevUrl);
      console.log('[PriceLookup]', upper, 'prev-day status:', prevRes.status);

      if (prevRes.ok) {
        const prevJson = await prevRes.json();
        if (prevJson.results && prevJson.results.length > 0) {
          const prev = prevJson.results[0];
          data = {
            ticker: upper,
            price: prev.c,
            change: null,
            changePercent: null,
            volume: prev.v,
            dayHigh: prev.h,
            dayLow: prev.l,
            prevClose: prev.c,
            marketOpen: false,
            note: 'Previous trading day close (markets are currently closed)',
          };
        }
      }
    } catch (err) {
      console.error('[PriceLookup] Prev-day error for', upper, ':', err.message);
    }
  }

  if (data) {
    console.log('[PriceLookup]', upper, ': $' + data.price, data.marketOpen ? '(live)' : '(prev close)');
    priceCache.set(upper, { data, ts: Date.now() });
  } else {
    console.warn('[PriceLookup]', upper, ': no data available');
  }

  return data;
}
