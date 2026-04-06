// ============================================
// UPTIKALERTS — breakoutScanner.js
// Detects breakout conditions and inserts
// alerts into breakout_alerts
// ============================================

import { supabase } from './supabase';
import { SCREENER_TICKERS } from './screener';

const FMP_KEY  = import.meta.env.VITE_FMP_API_KEY;
const BASE     = 'https://financialmodelingprep.com/stable';
const BASE_V3  = 'https://financialmodelingprep.com/api/v3';

// 52W High: how close to the high counts (default 2%)
export const DEFAULT_THRESHOLD = 2.0;

// Vol Surge: how many times avg volume counts as a surge (default 3x)
export const DEFAULT_VOL_MULTIPLIER = 3.0;

// Gap Up: how far above prev close the open must be (default 3%)
export const DEFAULT_GAP_THRESHOLD = 3.0;

// MA Cross: short and long period defaults (days)
export const DEFAULT_SHORT_MA = 20;
export const DEFAULT_LONG_MA  = 50;

async function fetchQuote(symbol) {
  try {
    const res = await fetch(`${BASE}/quote?symbol=${symbol}&apikey=${FMP_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

// Returns tickers already alerted today for a given alert_type
async function getAlertedTodaySet(alertType) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('breakout_alerts')
    .select('tickers')
    .eq('alert_type', alertType)
    .gte('created_at', startOfDay.toISOString());

  const alerted = new Set();
  (data || []).forEach(row => row.tickers?.forEach(t => alerted.add(t)));
  return alerted;
}

// Scan all tickers, return array of alerts that crossed the threshold
export async function scan52wHigh(threshold = DEFAULT_THRESHOLD, onProgress) {
  const alreadyAlerted = await getAlertedTodaySet('52w_high');
  const results = [];
  const batchSize = 5;
  let processed = 0;

  for (let i = 0; i < SCREENER_TICKERS.length; i += batchSize) {
    const batch = SCREENER_TICKERS.slice(i, i + batchSize);

    await Promise.all(batch.map(async (symbol) => {
      if (alreadyAlerted.has(symbol)) return;

      const q = await fetchQuote(symbol);
      if (!q || !q.price || !q.yearHigh || q.yearHigh <= 0) return;

      const pctFromHigh = ((q.yearHigh - q.price) / q.yearHigh) * 100;

      if (pctFromHigh <= threshold) {
        results.push({
          symbol,
          price:        q.price,
          high_52w:     q.yearHigh,
          pct_from_high: parseFloat(pctFromHigh.toFixed(2)),
        });
      }
    }));

    processed += batch.length;
    onProgress?.(Math.round((processed / SCREENER_TICKERS.length) * 100));

    if (i + batchSize < SCREENER_TICKERS.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results;
}

// Run scanner and insert results into breakout_alerts
export async function run52wHighScan(threshold = DEFAULT_THRESHOLD, onProgress) {
  const hits = await scan52wHigh(threshold, onProgress);

  if (hits.length === 0) return { inserted: 0, hits: [] };

  const rows = hits.map(h => ({
    alert_type:    '52w_high',
    tickers:       [h.symbol],
    title:         `${h.symbol} is within ${h.pct_from_high.toFixed(2)}% of its 52-week high`,
    body:          `Price $${h.price.toFixed(2)} · 52W High $${h.high_52w.toFixed(2)} · ${h.pct_from_high.toFixed(2)}% away`,
    price:         h.price,
    high_52w:      h.high_52w,
    pct_from_high: h.pct_from_high,
    sent_by:       'scanner',
  }));

  const { error } = await supabase.from('breakout_alerts').insert(rows);
  if (error) throw error;

  return { inserted: rows.length, hits };
}

// ── GAP UP ────────────────────────────────────────────────────────────────────

// Scan all tickers, return those where open >= threshold% above previousClose
export async function scanGapUp(threshold = DEFAULT_GAP_THRESHOLD, onProgress) {
  const alreadyAlerted = await getAlertedTodaySet('gap_up');
  const results = [];
  const batchSize = 5;
  let processed = 0;

  for (let i = 0; i < SCREENER_TICKERS.length; i += batchSize) {
    const batch = SCREENER_TICKERS.slice(i, i + batchSize);

    await Promise.all(batch.map(async (symbol) => {
      if (alreadyAlerted.has(symbol)) return;

      const q = await fetchQuote(symbol);
      if (!q || !q.open || !q.previousClose || q.previousClose <= 0) return;

      const gapPct = ((q.open - q.previousClose) / q.previousClose) * 100;

      if (gapPct >= threshold) {
        results.push({
          symbol,
          open_price: q.open,
          prev_close: q.previousClose,
          gap_pct:    parseFloat(gapPct.toFixed(2)),
        });
      }
    }));

    processed += batch.length;
    onProgress?.(Math.round((processed / SCREENER_TICKERS.length) * 100));

    if (i + batchSize < SCREENER_TICKERS.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results;
}

// Run Gap Up scanner and insert results into breakout_alerts
export async function runGapUpScan(threshold = DEFAULT_GAP_THRESHOLD, onProgress) {
  const hits = await scanGapUp(threshold, onProgress);

  if (hits.length === 0) return { inserted: 0, hits: [] };

  const rows = hits.map(h => ({
    alert_type: 'gap_up',
    tickers:    [h.symbol],
    title:      `${h.symbol} gapped up +${h.gap_pct.toFixed(2)}% at the open`,
    body:       `Open $${h.open_price.toFixed(2)} · Prev Close $${h.prev_close.toFixed(2)} · +${h.gap_pct.toFixed(2)}% gap`,
    open_price: h.open_price,
    prev_close: h.prev_close,
    gap_pct:    h.gap_pct,
    sent_by:    'scanner',
  }));

  const { error } = await supabase.from('breakout_alerts').insert(rows);
  if (error) throw error;

  return { inserted: rows.length, hits };
}

// ── MA CROSS ──────────────────────────────────────────────────────────────────

// Fetch enough daily closes to compute both MAs (longPeriod + 1 days needed)
async function fetchDailyCloses(symbol, days) {
  try {
    const res = await fetch(
      `${BASE_V3}/historical-price-full/${symbol}?timeseries=${days}&apikey=${FMP_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Returns newest-first; reverse so index 0 = oldest
    const closes = (data?.historical ?? []).map(d => d.close).reverse();
    return closes.length >= days ? closes : null;
  } catch {
    return null;
  }
}

function calcSMA(closes, period) {
  const slice = closes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

// Scan all tickers for a bullish MA crossover:
// yesterday shortMA <= longMA, today shortMA > longMA
export async function scanMACross(
  shortPeriod = DEFAULT_SHORT_MA,
  longPeriod  = DEFAULT_LONG_MA,
  onProgress
) {
  const alreadyAlerted = await getAlertedTodaySet('ma_cross');
  const results  = [];
  // Need longPeriod + 1 days so we can compare today vs yesterday
  const daysNeeded = longPeriod + 1;
  const batchSize  = 3; // slower endpoint — smaller batch to avoid rate limits
  let processed    = 0;

  for (let i = 0; i < SCREENER_TICKERS.length; i += batchSize) {
    const batch = SCREENER_TICKERS.slice(i, i + batchSize);

    await Promise.all(batch.map(async (symbol) => {
      if (alreadyAlerted.has(symbol)) return;

      const closes = await fetchDailyCloses(symbol, daysNeeded);
      if (!closes || closes.length < daysNeeded) return;

      // "today" = last close, "yesterday" = second-to-last
      const todayCloses     = closes;
      const yesterdayCloses = closes.slice(0, -1);

      const todayShort     = calcSMA(todayCloses,     shortPeriod);
      const todayLong      = calcSMA(todayCloses,     longPeriod);
      const yesterdayShort = calcSMA(yesterdayCloses, shortPeriod);
      const yesterdayLong  = calcSMA(yesterdayCloses, longPeriod);

      const crossedAbove =
        yesterdayShort <= yesterdayLong && todayShort > todayLong;

      if (crossedAbove) {
        results.push({
          symbol,
          short_ma:        parseFloat(todayShort.toFixed(2)),
          long_ma:         parseFloat(todayLong.toFixed(2)),
          short_ma_period: shortPeriod,
          long_ma_period:  longPeriod,
        });
      }
    }));

    processed += batch.length;
    onProgress?.(Math.round((processed / SCREENER_TICKERS.length) * 100));

    if (i + batchSize < SCREENER_TICKERS.length) {
      await new Promise(r => setTimeout(r, 500)); // slightly longer delay for historical endpoint
    }
  }

  return results;
}

// Run MA Cross scanner and insert results into breakout_alerts
export async function runMACrossScan(
  shortPeriod = DEFAULT_SHORT_MA,
  longPeriod  = DEFAULT_LONG_MA,
  onProgress
) {
  const hits = await scanMACross(shortPeriod, longPeriod, onProgress);

  if (hits.length === 0) return { inserted: 0, hits: [] };

  const rows = hits.map(h => ({
    alert_type:      'ma_cross',
    tickers:         [h.symbol],
    title:           `${h.symbol} ${h.short_ma_period}-day MA crossed above ${h.long_ma_period}-day MA`,
    body:            `${h.short_ma_period}MA $${h.short_ma.toFixed(2)} · ${h.long_ma_period}MA $${h.long_ma.toFixed(2)} · bullish crossover`,
    short_ma:        h.short_ma,
    long_ma:         h.long_ma,
    short_ma_period: h.short_ma_period,
    long_ma_period:  h.long_ma_period,
    sent_by:         'scanner',
  }));

  const { error } = await supabase.from('breakout_alerts').insert(rows);
  if (error) throw error;

  return { inserted: rows.length, hits };
}

// ── VOL SURGE ─────────────────────────────────────────────────────────────────

// Scan all tickers, return those where volume >= multiplier * avgVolume
export async function scanVolSurge(multiplier = DEFAULT_VOL_MULTIPLIER, onProgress) {
  const alreadyAlerted = await getAlertedTodaySet('vol_surge');
  const results = [];
  const batchSize = 5;
  let processed = 0;

  for (let i = 0; i < SCREENER_TICKERS.length; i += batchSize) {
    const batch = SCREENER_TICKERS.slice(i, i + batchSize);

    await Promise.all(batch.map(async (symbol) => {
      if (alreadyAlerted.has(symbol)) return;

      const q = await fetchQuote(symbol);
      if (!q || !q.volume || !q.avgVolume || q.avgVolume <= 0) return;

      const ratio = q.volume / q.avgVolume;

      if (ratio >= multiplier) {
        results.push({
          symbol,
          current_volume: q.volume,
          avg_volume:     q.avgVolume,
          volume_ratio:   parseFloat(ratio.toFixed(2)),
        });
      }
    }));

    processed += batch.length;
    onProgress?.(Math.round((processed / SCREENER_TICKERS.length) * 100));

    if (i + batchSize < SCREENER_TICKERS.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results;
}

// Run Vol Surge scanner and insert results into breakout_alerts
export async function runVolSurgeScan(multiplier = DEFAULT_VOL_MULTIPLIER, onProgress) {
  const hits = await scanVolSurge(multiplier, onProgress);

  if (hits.length === 0) return { inserted: 0, hits: [] };

  const rows = hits.map(h => ({
    alert_type:     'vol_surge',
    tickers:        [h.symbol],
    title:          `${h.symbol} volume is ${h.volume_ratio}x above average`,
    body:           `Vol ${(h.current_volume / 1e6).toFixed(1)}M · Avg ${(h.avg_volume / 1e6).toFixed(1)}M · ${h.volume_ratio}x avg`,
    current_volume: h.current_volume,
    avg_volume:     h.avg_volume,
    volume_ratio:   h.volume_ratio,
    sent_by:        'scanner',
  }));

  const { error } = await supabase.from('breakout_alerts').insert(rows);
  if (error) throw error;

  return { inserted: rows.length, hits };
}
