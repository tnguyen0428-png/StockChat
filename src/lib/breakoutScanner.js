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

// 52W High: within 5% of the high catches breakouts early while filtering noise
export const DEFAULT_THRESHOLD = 5.0;

// Vol Surge: 2x avg volume flags meaningful institutional activity
export const DEFAULT_VOL_MULTIPLIER = 2.0;

// Gap Up: 1.5% catches actionable gaps without flooding with micro-gaps
export const DEFAULT_GAP_THRESHOLD = 1.5;

// MA Cross: 9/21 is responsive for short-term momentum signals
export const DEFAULT_SHORT_MA = 9;
export const DEFAULT_LONG_MA  = 21;

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
          price:         q.price,
          change_pct:    q.changesPercentage ?? null,
          volume:        q.volume ?? null,
          avg_volume:    q.avgVolume ?? null,
          high_52w:      q.yearHigh,
          pct_from_high: parseFloat(pctFromHigh.toFixed(2)),
          sector:        q.sector ?? null,
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
    signal_type:   '52w_high',
    ticker:        h.symbol,
    price:         h.price,
    change_pct:    h.change_pct,
    volume:        h.volume,
    avg_volume:    h.avg_volume,
    high_52w:      h.high_52w,
    pct_from_high: h.pct_from_high,
    sector:        h.sector,
    notes:         `Price $${h.price.toFixed(2)} · 52W High $${h.high_52w.toFixed(2)} · ${h.pct_from_high.toFixed(2)}% away`,
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
          price:      q.price,
          change_pct: q.changesPercentage ?? null,
          volume:     q.volume ?? null,
          avg_volume: q.avgVolume ?? null,
          open_price: q.open,
          prev_close: q.previousClose,
          gap_pct:    parseFloat(gapPct.toFixed(2)),
          sector:     q.sector ?? null,
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
    signal_type: 'gap_up',
    ticker:      h.symbol,
    price:       h.price,
    change_pct:  h.change_pct,
    volume:      h.volume,
    avg_volume:  h.avg_volume,
    open_price:  h.open_price,
    prev_close:  h.prev_close,
    gap_pct:     h.gap_pct,
    sector:      h.sector,
    notes:       `Open $${h.open_price.toFixed(2)} · Prev Close $${h.prev_close.toFixed(2)} · +${h.gap_pct.toFixed(2)}% gap`,
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
        // Fetch live quote for price, volume, sector
        const q = await fetchQuote(symbol);
        results.push({
          symbol,
          price:           q?.price ?? null,
          change_pct:      q?.changesPercentage ?? null,
          volume:          q?.volume ?? null,
          avg_volume:      q?.avgVolume ?? null,
          short_ma:        parseFloat(todayShort.toFixed(2)),
          long_ma:         parseFloat(todayLong.toFixed(2)),
          short_ma_period: shortPeriod,
          long_ma_period:  longPeriod,
          sector:          q?.sector ?? null,
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
    signal_type:     'ma_cross',
    ticker:          h.symbol,
    price:           h.price,
    change_pct:      h.change_pct,
    volume:          h.volume,
    avg_volume:      h.avg_volume,
    short_ma:        h.short_ma,
    long_ma:         h.long_ma,
    short_ma_period: h.short_ma_period,
    long_ma_period:  h.long_ma_period,
    sector:          h.sector,
    notes:           `${h.short_ma_period}MA $${h.short_ma.toFixed(2)} · ${h.long_ma_period}MA $${h.long_ma.toFixed(2)} · bullish crossover`,
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
          price:          q.price,
          change_pct:     q.changesPercentage ?? null,
          current_volume: q.volume,
          avg_volume:     q.avgVolume,
          volume_ratio:   parseFloat(ratio.toFixed(2)),
          sector:         q.sector ?? null,
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
    signal_type:    'vol_surge',
    ticker:         h.symbol,
    price:          h.price,
    change_pct:     h.change_pct,
    volume:         h.current_volume,
    avg_volume:     h.avg_volume,
    volume_ratio:   h.volume_ratio,
    sector:         h.sector,
    notes:          `Vol ${(h.current_volume / 1e6).toFixed(1)}M · Avg ${(h.avg_volume / 1e6).toFixed(1)}M · ${h.volume_ratio}x avg`,
  }));

  const { error } = await supabase.from('breakout_alerts').insert(rows);
  if (error) throw error;

  return { inserted: rows.length, hits };
}
