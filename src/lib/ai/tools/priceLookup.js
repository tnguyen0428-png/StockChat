const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const priceCache = new Map();
const CACHE_TTL = 60 * 1000;

export async function lookupPrice(ticker) {
  const upper = ticker.toUpperCase();
  const cached = priceCache.get(upper);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/price-lookup?ticker=${upper}`,
      { headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY } }
    );

    console.log('[PriceLookup]', upper, 'status:', res.status);

    if (!res.ok) {
      console.error('[PriceLookup] Failed:', res.status);
      return null;
    }

    const data = await res.json();
    if (!data.price) {
      console.warn('[PriceLookup]', upper, ': no price data');
      return null;
    }

    console.log('[PriceLookup] RAW response for', upper, JSON.stringify(data));
    priceCache.set(upper, { data, ts: Date.now() });
    return data;
  } catch (err) {
    console.error('[PriceLookup] Error for', upper, ':', err.message);
    return null;
  }
}
