// ============================================
// UPTIKALERTS — polygonClient.js
// Tiny client helper that routes Polygon reads through
// the polygon-proxy edge function. Drop-in replacement
// for `fetch('https://api.polygon.io/<path>?apiKey=...')`.
// ============================================

import { supabase } from './supabase';

/**
 * Call a Polygon endpoint via the proxy.
 * @param {string} path  Polygon path including leading slash, e.g.
 *   '/v2/snapshot/locale/us/markets/stocks/tickers?tickers=AAPL,MSFT'
 * @returns {Promise<any>} Parsed JSON body.
 */
export async function polyFetch(path) {
  const { data, error } = await supabase.functions.invoke('polygon-proxy', {
    body: { path },
  });
  if (error) throw error;
  return data;
}
