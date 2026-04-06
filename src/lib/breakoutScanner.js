// ============================================
// UPTIKALERTS — breakoutScanner.js
// Detects breakout conditions and inserts
// alerts into breakout_alerts
//
// POWERED BY: Polygon.io API
// Batched v3 snapshot for quotes (~5 calls for 249 tickers)
// Per-ticker aggs for historical data (52w high, MA cross)
// ============================================

import { supabase, supabaseAdmin } from './supabase';
import { SCREENER_TICKERS } from './screener';

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;
const POLY_BASE   = 'https://api.polygon.io';

// 52W High: how close to the high counts (default 2%)
export const DEFAULT_THRESHOLD = 2.0;

// Vol Surge: how many times avg volume counts as a surge (default 3x)
export const DEFAULT_VOL_MULTIPLIER = 3.0;

// Gap Up: how far above prev close the open must be (default 3%)
export const DEFAULT_GAP_THRESHOLD = 3.0;

// MA Cross: short and long period defaults (days)
export const DEFAULT_SHORT_MA = 20;
export const DEFAULT_LONG_MA  = 50;

// ── BATCHED SNAPSHOT FETCH (Polygon v3) ─────────────────────────────────────
// /v3/snapshot?ticker.any_of=AAPL,TSLA,...  accepts 50+ tickers per call
// Response: { results: [{ ticker, name, session: { close, open, previous_close, volume, change_percent, high, low, price } }] }

const SNAPSHOT_BATCH = 50; // Polygon handles 50+ per call easily

// Cache so multiple scanners can share one fetch cycle
let _quoteCache = null;
let _quoteCacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

async function fetchBatchSnapshots(symbols) {
  const results = new Map();

  for (let i = 0; i < symbols.length; i += SNAPSHOT_BATCH) {
    const batch = symbols.slice(i, i + SNAPSHOT_BATCH);
    const joined = batch.join(',');
    try {
      const res = await fetch(
        `${POLY_BASE}/v3/snapshot?ticker.any_of=${joined}&apiKey=${POLYGON_KEY}`
      );
      if (!res.ok) {
        console.warn(`[scanner] Polygon snapshot batch ${Math.floor(i / SNAPSHOT_BATCH) + 1} failed (HTTP ${res.status})`);
        if (res.status === 429) {
          console.warn('[scanner] Polygon rate limited — pausing 2s');
          await new Promise(r => setTimeout(r, 2000));
          // Retry once
          const retry = await fetch(`${POLY_BASE}/v3/snapshot?ticker.any_of=${joined}&apiKey=${POLYGON_KEY}`);
          if (retry.ok) {
            const retryData = await retry.json();
            (retryData.results || []).forEach(q => results.set(q.ticker, q));
          }
        }
        continue;
      }
      const data = await res.json();

      if (i === 0) {
        console.log(`[scanner] Polygon snapshot batch 1: ${data.results?.length || 0} tickers returned`);
      }

      (data.results || []).forEach(q => {
        if (q?.ticker) results.set(q.ticker, q);
      });
    } catch (err) {
      console.warn(`[scanner] Snapshot batch error:`, err.message);
    }
    // Small delay between batches
    if (i + SNAPSHOT_BATCH < symbols.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
}

// Get all quotes — uses cache if still fresh
export async function getAllQuotes(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _quoteCache && (now - _quoteCacheTime) < CACHE_TTL) {
    console.log(`[scanner] Using cached quotes (${_quoteCache.size} tickers, ${Math.round((now - _quoteCacheTime) / 1000)}s old)`);
    return _quoteCache;
  }
  console.log(`[scanner] Fetching Polygon snapshots for ${SCREENER_TICKERS.length} tickers...`);
  _quoteCache = await fetchBatchSnapshots(SCREENER_TICKERS);
  _quoteCacheTime = Date.now();
  console.log(`[scanner] Got ${_quoteCache.size} quotes in ${Date.now() - now}ms (~${Math.ceil(SCREENER_TICKERS.length / SNAPSHOT_BATCH)} API calls)`);
  return _quoteCache;
}

export function clearQuoteCache() {
  _quoteCache = null;
  _quoteCacheTime = 0;
}

// ── Helper to extract fields from Polygon v3 snapshot ───────────────────────
// Polygon v3 snapshot shape:
// { ticker, name, session: { close, open, previous_close, volume, change_percent, high, low, price, vwap } }
function snapPrice(q) { return q?.session?.close || q?.session?.price || 0; }
function snapOpen(q) { return q?.session?.open || 0; }
function snapPrevClose(q) { return q?.session?.previous_close || 0; }
function snapVolume(q) { return q?.session?.volume || 0; }
function snapChange(q) { return q?.session?.change_percent || 0; }
function snapName(q) { return q?.name || null; }

// ── Per-ticker historical bars (Polygon v2 aggs) ────────────────────────────
// Used for: 52-week high, avg volume, MA cross
async function fetchDailyBars(symbol, days = 260) {
  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  try {
    const res = await fetch(
      `${POLY_BASE}/v2/aggs/ticker/${symbol}/range/1/day/${start}/${end}?adjusted=true&sort=asc&limit=${days}&apiKey=${POLYGON_KEY}`
    );
    if (!res.ok) {
      if (res.status === 429) await new Promise(r => setTimeout(r, 1500));
      return null;
    }
    const data = await res.json();
    return data.results || null;
  } catch {
    return null;
  }
}

// Returns tickers already alerted today for a given signal_type
async function getAlertedTodaySet(signalType) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('breakout_alerts')
    .select('ticker')
    .eq('signal_type', signalType)
    .gte('created_at', startOfDay.toISOString());

  const alerted = new Set();
  (data || []).forEach(row => { if (row.ticker) alerted.add(row.ticker); });
  return alerted;
}

// ── 52W HIGH ─────────────────────────────────────────────────────────────────
// Strategy: Use snapshots for current price, then fetch 1-year aggs per ticker
// to find the 52-week high and avg volume.

export async function scan52wHigh(threshold = DEFAULT_THRESHOLD, onProgress) {
  const [alreadyAlerted, quotes] = await Promise.all([
    getAlertedTodaySet('52w_high'),
    getAllQuotes(),
  ]);
  const results = [];
  const tickers = SCREENER_TICKERS.filter(s => !alreadyAlerted.has(s));

  // Fetch 1-year bars for each ticker to get 52w high
  let processed = 0;
  const BATCH = 5; // parallel requests

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);

    await Promise.all(batch.map(async (symbol) => {
      const q = quotes.get(symbol);
      const price = snapPrice(q);
      if (!price) return;

      const bars = await fetchDailyBars(symbol, 260);
      if (!bars || bars.length < 20) return;

      const yearHigh = Math.max(...bars.map(b => b.h));
      const avgVolume = Math.round(bars.slice(-50).reduce((s, b) => s + b.v, 0) / Math.min(bars.length, 50));
      const pctFromHigh = ((yearHigh - price) / yearHigh) * 100;

      if (pctFromHigh <= threshold) {
        results.push({
          symbol,
          price,
          high_52w:      yearHigh,
          pct_from_high: parseFloat(pctFromHigh.toFixed(2)),
          name:          snapName(q),
          sector:        null, // Polygon snapshot doesn't include sector
          marketCap:     null,
          change:        snapChange(q),
          volume:        snapVolume(q),
          avgVolume,
        });
      }
    }));

    processed += batch.length;
    onProgress?.(Math.round((processed / tickers.length) * 100));

    if (i + BATCH < tickers.length) {
      await new Promise(r => setTimeout(r, 250));
    }
  }

  return results;
}

export async function run52wHighScan(threshold = DEFAULT_THRESHOLD, onProgress) {
  const hits = await scan52wHigh(threshold, onProgress);
  if (hits.length === 0) return { inserted: 0, hits: [] };

  const rows = hits.map(h => ({
    signal_type:   '52w_high',
    ticker:        h.symbol,
    price:         h.price,
    high_52w:      h.high_52w,
    pct_from_high: h.pct_from_high,
    volume:        h.volume,
    avg_volume:    h.avgVolume,
    change_pct:    h.change,
    notes:         `${h.name || h.symbol} within ${h.pct_from_high.toFixed(2)}% of 52W high $${h.high_52w.toFixed(2)}`,
  }));

  const db = supabaseAdmin || supabase;
  const { error } = await db.from('breakout_alerts').insert(rows);
  if (error) throw error;

  return { inserted: rows.length, hits };
}

// ── GAP UP ────────────────────────────────────────────────────────────────────
// Uses snapshot data only — open vs previous_close

export async function scanGapUp(threshold = DEFAULT_GAP_THRESHOLD, onProgress) {
  const [alreadyAlerted, quotes] = await Promise.all([
    getAlertedTodaySet('gap_up'),
    getAllQuotes(),
  ]);
  const results = [];

  const tickers = SCREENER_TICKERS.filter(s => !alreadyAlerted.has(s));
  tickers.forEach((symbol, i) => {
    const q = quotes.get(symbol);
    const open = snapOpen(q);
    const prevClose = snapPrevClose(q);
    if (!open || !prevClose || prevClose <= 0) return;

    const gapPct = ((open - prevClose) / prevClose) * 100;

    if (gapPct >= threshold) {
      results.push({
        symbol,
        open_price: open,
        prev_close: prevClose,
        gap_pct:    parseFloat(gapPct.toFixed(2)),
        name:       snapName(q),
        sector:     null,
        marketCap:  null,
        change:     snapChange(q),
        volume:     snapVolume(q),
        avgVolume:  null,
        price:      snapPrice(q),
      });
    }

    onProgress?.(Math.round(((i + 1) / tickers.length) * 100));
  });

  return results;
}

export async function runGapUpScan(threshold = DEFAULT_GAP_THRESHOLD, onProgress) {
  const hits = await scanGapUp(threshold, onProgress);
  if (hits.length === 0) return { inserted: 0, hits: [] };

  const rows = hits.map(h => ({
    signal_type: 'gap_up',
    ticker:      h.symbol,
    price:       h.price,
    open_price:  h.open_price,
    prev_close:  h.prev_close,
    gap_pct:     h.gap_pct,
    volume:      h.volume,
    avg_volume:  h.avgVolume,
    change_pct:  h.change,
    notes:       `${h.name || h.symbol} gapped up +${h.gap_pct.toFixed(2)}%`,
  }));

  const db = supabaseAdmin || supabase;
  const { error } = await db.from('breakout_alerts').insert(rows);
  if (error) throw error;

  return { inserted: rows.length, hits };
}

// ── MA CROSS ──────────────────────────────────────────────────────────────────
// Needs per-ticker historical bars from Polygon aggs

function calcSMA(closes, period) {
  const slice = closes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

export async function scanMACross(
  shortPeriod = DEFAULT_SHORT_MA,
  longPeriod  = DEFAULT_LONG_MA,
  onProgress
) {
  const alreadyAlerted = await getAlertedTodaySet('ma_cross');
  const results  = [];
  const daysNeeded = longPeriod + 5; // extra buffer
  const BATCH    = 5;
  let processed  = 0;

  // Pre-fetch snapshots for enrichment
  const quotes = await getAllQuotes();

  for (let i = 0; i < SCREENER_TICKERS.length; i += BATCH) {
    const batch = SCREENER_TICKERS.slice(i, i + BATCH);

    await Promise.all(batch.map(async (symbol) => {
      if (alreadyAlerted.has(symbol)) return;

      const bars = await fetchDailyBars(symbol, daysNeeded);
      if (!bars || bars.length < daysNeeded) return;

      const closes = bars.map(b => b.c);

      const todayCloses     = closes;
      const yesterdayCloses = closes.slice(0, -1);

      const todayShort     = calcSMA(todayCloses,     shortPeriod);
      const todayLong      = calcSMA(todayCloses,     longPeriod);
      const yesterdayShort = calcSMA(yesterdayCloses, shortPeriod);
      const yesterdayLong  = calcSMA(yesterdayCloses, longPeriod);

      const crossedAbove =
        yesterdayShort <= yesterdayLong && todayShort > todayLong;

      if (crossedAbove) {
        const q = quotes.get(symbol);
        results.push({
          symbol,
          short_ma:        parseFloat(todayShort.toFixed(2)),
          long_ma:         parseFloat(todayLong.toFixed(2)),
          short_ma_period: shortPeriod,
          long_ma_period:  longPeriod,
          name:            snapName(q),
          sector:          null,
          price:           snapPrice(q) || closes[closes.length - 1],
          change:          snapChange(q),
          volume:          snapVolume(q),
          avgVolume:       null,
        });
      }
    }));

    processed += batch.length;
    onProgress?.(Math.round((processed / SCREENER_TICKERS.length) * 100));

    if (i + BATCH < SCREENER_TICKERS.length) {
      await new Promise(r => setTimeout(r, 250));
    }
  }

  return results;
}

export async function runMACrossScan(
  shortPeriod = DEFAULT_SHORT_MA,
  longPeriod  = DEFAULT_LONG_MA,
  onProgress
) {
  const hits = await scanMACross(shortPeriod, longPeriod, onProgress);
  if (hits.length === 0) return { inserted: 0, hits: [] };

  const rows = hits.map(h => ({
    signal_type:     'ma_cross',
    ticker:          h.symbol,
    price:           h.price,
    short_ma:        h.short_ma,
    long_ma:         h.long_ma,
    short_ma_period: h.short_ma_period,
    long_ma_period:  h.long_ma_period,
    volume:          h.volume,
    avg_volume:      h.avgVolume,
    change_pct:      h.change,
    notes:           `${h.name || h.symbol} ${h.short_ma_period}MA crossed above ${h.long_ma_period}MA`,
  }));

  const db = supabaseAdmin || supabase;
  const { error } = await db.from('breakout_alerts').insert(rows);
  if (error) throw error;

  return { inserted: rows.length, hits };
}

// ── VOL SURGE ─────────────────────────────────────────────────────────────────
// Needs current volume from snapshot + avg volume from historical bars

export async function scanVolSurge(multiplier = DEFAULT_VOL_MULTIPLIER, onProgress) {
  const [alreadyAlerted, quotes] = await Promise.all([
    getAlertedTodaySet('vol_surge'),
    getAllQuotes(),
  ]);
  const results = [];
  const tickers = SCREENER_TICKERS.filter(s => !alreadyAlerted.has(s));

  let processed = 0;
  const BATCH = 5;

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);

    await Promise.all(batch.map(async (symbol) => {
      const q = quotes.get(symbol);
      const currentVol = snapVolume(q);
      if (!currentVol) return;

      // Fetch 50 days of bars to calculate avg volume
      const bars = await fetchDailyBars(symbol, 55);
      if (!bars || bars.length < 20) return;

      // Exclude today's partial bar (last bar) when computing average
      const histBars = bars.slice(0, -1);
      const avgVolume = Math.round(histBars.slice(-50).reduce((s, b) => s + b.v, 0) / Math.min(histBars.length, 50));
      if (avgVolume <= 0) return;

      const ratio = currentVol / avgVolume;

      if (ratio >= multiplier) {
        results.push({
          symbol,
          current_volume: currentVol,
          avg_volume:     avgVolume,
          volume_ratio:   parseFloat(ratio.toFixed(2)),
          name:           snapName(q),
          sector:         null,
          marketCap:      null,
          change:         snapChange(q),
          price:          snapPrice(q),
        });
      }
    }));

    processed += batch.length;
    onProgress?.(Math.round((processed / tickers.length) * 100));

    if (i + BATCH < tickers.length) {
      await new Promise(r => setTimeout(r, 250));
    }
  }

  return results;
}

export async function runVolSurgeScan(multiplier = DEFAULT_VOL_MULTIPLIER, onProgress) {
  const hits = await scanVolSurge(multiplier, onProgress);
  if (hits.length === 0) return { inserted: 0, hits: [] };

  const rows = hits.map(h => ({
    signal_type:    'vol_surge',
    ticker:         h.symbol,
    price:          h.price,
    current_volume: h.current_volume,
    avg_volume:     h.avg_volume,
    volume_ratio:   h.volume_ratio,
    change_pct:     h.change,
    notes:          `${h.name || h.symbol} volume ${h.volume_ratio}x above average`,
  }));

  const db = supabaseAdmin || supabase;
  const { error } = await db.from('breakout_alerts').insert(rows);
  if (error) throw error;

  return { inserted: rows.length, hits };
}
