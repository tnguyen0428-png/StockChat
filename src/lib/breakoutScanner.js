// ============================================
// UPTIKALERTS — breakoutScanner.js
// Detects breakout conditions and inserts
// alerts into breakout_alerts
// ============================================
// API priority: Polygon.io (direct) → FMP (fallback)
// Unusual Whales flow data handled by fetch-flow-data edge function
// ============================================
// DB columns (base + migrations):
//   id, group_id, ticker, signal_type, price, change_pct, volume, rel_volume,
//   notes, created_at, sector, conviction, sector_tier
//   + additional: avg_volume, high_52w, pct_from_high, gap_pct, short_ma,
//     long_ma, volume_ratio, open_price, prev_close

import { supabase } from './supabase';
import { SCREENER_TICKERS } from './screener';

// ── API Config ──
const POLYGON_KEY  = import.meta.env.VITE_POLYGON_API_KEY;
const POLYGON_BASE = 'https://api.polygon.io';
const FMP_KEY      = import.meta.env.VITE_FMP_API_KEY;
const FMP_BASE     = 'https://financialmodelingprep.com/stable';
const FMP_BASE_V3  = 'https://financialmodelingprep.com/api/v3';

/**
 * Direct Polygon fetch — bypasses the edge function proxy.
 * Appends the API key and handles errors consistently.
 */
async function polygonGet(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${POLYGON_BASE}${path}${sep}apiKey=${POLYGON_KEY}`;
  const res = await fetch(url);
  if (res.status === 429) throw new Error('Polygon rate limit — try again shortly');
  if (!res.ok) throw new Error(`Polygon HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ── Scanner Defaults ──
export const DEFAULT_THRESHOLD      = 5.0;   // 52W High: within 5%
export const DEFAULT_VOL_MULTIPLIER = 2.0;   // Vol Surge: 2x avg
export const DEFAULT_GAP_THRESHOLD  = 1.5;   // Gap Up: 1.5%
export const DEFAULT_SHORT_MA       = 9;     // MA Cross: 9-day
export const DEFAULT_LONG_MA        = 21;    // MA Cross: 21-day

// ══════════════════════════════════════════════════════════════════════════════
// DATA LAYER — Polygon primary, FMP fallback
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Batch-fetch live snapshots from Polygon for up to hundreds of tickers.
 * Returns Map<symbol, { price, open, previousClose, volume, prevDayVolume, changesPercentage }>
 */
async function fetchPolygonSnapshots(symbols) {
  const map = {};
  const BATCH = 80; // ~80 tickers × 5 chars ≈ 400 chars; well under URL limits

  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    try {
      const data = await polygonGet(
        `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${batch.join(',')}`
      );
      if (data?.tickers) {
        for (const t of data.tickers) {
          const dayVol  = t.day?.v ?? 0;
          const prevVol = t.prevDay?.v ?? 0;

          // If market is open use day data; otherwise fall back to prevDay
          if (dayVol > 0) {
            map[t.ticker] = {
              price:             t.day?.c ?? null,
              open:              t.day?.o ?? null,
              previousClose:     t.prevDay?.c ?? null,
              volume:            Math.round(dayVol),
              prevDayVolume:     prevVol > 0 ? Math.round(prevVol) : null,
              changesPercentage: t.todaysChangePerc ?? null,
            };
          } else if (prevVol > 0) {
            // Market closed — use prevDay as "latest"
            map[t.ticker] = {
              price:             t.prevDay?.c ?? null,
              open:              t.prevDay?.o ?? null,
              previousClose:     null, // no day before prevDay in snapshot
              volume:            Math.round(prevVol),
              prevDayVolume:     null,
              changesPercentage: t.todaysChangePerc ?? null,
            };
          }
        }
      }
    } catch (e) {
      console.warn(`[Polygon] Snapshot batch ${i}–${i + batch.length} failed:`, e.message);
    }
  }

  console.log(`[Polygon] Snapshots loaded: ${Object.keys(map).length}/${symbols.length}`);
  return map;
}

/**
 * Fetch daily aggregates from Polygon for a single ticker.
 * Returns { closes, highs, volumes } arrays (oldest → newest) or null.
 */
async function fetchPolygonAggs(symbol, days) {
  try {
    const to = new Date().toISOString().split('T')[0];
    // Buffer for weekends/holidays — 1.8x calendar days usually gives enough trading days
    const fromDate = new Date(Date.now() - Math.ceil(days * 1.8) * 86400000);
    const from = fromDate.toISOString().split('T')[0];

    const data = await polygonGet(
      `/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=${days + 15}`
    );

    if (data?.results && data.results.length >= days) {
      const results = data.results.slice(-days);
      return {
        closes:  results.map(d => d.c),
        highs:   results.map(d => d.h),
        volumes: results.map(d => d.v),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch a single quote from FMP (fallback).
 */
async function fetchFMPQuote(symbol) {
  if (!FMP_KEY) return null;
  try {
    const res = await fetch(`${FMP_BASE}/quote?symbol=${symbol}&apikey=${FMP_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    const q = data?.[0];
    if (!q) return null;
    return {
      price:             q.price ?? null,
      open:              q.open ?? null,
      previousClose:     q.previousClose ?? null,
      volume:            q.volume != null ? Math.round(q.volume) : null,
      avgVolume:         q.avgVolume != null ? Math.round(q.avgVolume) : null,
      yearHigh:          q.yearHigh ?? null,
      changesPercentage: q.changesPercentage ?? null,
      sector:            q.sector ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch daily closes from FMP (fallback for historical data).
 */
async function fetchFMPDailyCloses(symbol, days) {
  if (!FMP_KEY) return null;
  try {
    const res = await fetch(
      `${FMP_BASE_V3}/historical-price-full/${symbol}?timeseries=${days}&apikey=${FMP_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    // FMP returns newest-first; reverse so index 0 = oldest
    const closes = (data?.historical ?? []).map(d => d.close).reverse();
    return closes.length >= days ? closes : null;
  } catch {
    return null;
  }
}

// ── Helpers ──

async function getAlertedTodaySet(signalType) {
  const now = new Date();
  const startOfDayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const { data } = await supabase
    .from('breakout_alerts')
    .select('ticker')
    .eq('signal_type', signalType)
    .gte('created_at', startOfDayUTC.toISOString());

  const alerted = new Set();
  (data || []).forEach(row => { if (row.ticker) alerted.add(row.ticker); });
  return alerted;
}

function calcSMA(closes, period) {
  const slice = closes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

// ══════════════════════════════════════════════════════════════════════════════
// GAP UP — Polygon snapshot batch (fastest: ~3-4 API calls for 249 tickers)
// ══════════════════════════════════════════════════════════════════════════════

export async function scanGapUp(threshold = DEFAULT_GAP_THRESHOLD, onProgress) {
  const alreadyAlerted = await getAlertedTodaySet('gap_up');
  const candidates = SCREENER_TICKERS.filter(s => !alreadyAlerted.has(s));
  const results = [];

  // ── Phase 1: Polygon snapshot batch ──
  onProgress?.(5);
  console.log(`[Gap Up] Fetching Polygon snapshots for ${candidates.length} tickers…`);
  const snapshots = await fetchPolygonSnapshots(candidates);
  onProgress?.(50);

  const needFallback = [];

  for (const symbol of candidates) {
    const q = snapshots[symbol];
    if (q && q.open != null && q.previousClose != null && q.previousClose > 0) {
      const gapPct = ((q.open - q.previousClose) / q.previousClose) * 100;
      if (gapPct >= threshold) {
        results.push({
          symbol, price: q.price, change_pct: q.changesPercentage,
          volume: q.volume, avg_volume: null,
          open_price: q.open, prev_close: q.previousClose,
          gap_pct: parseFloat(gapPct.toFixed(2)), sector: null,
        });
      }
    } else {
      needFallback.push(symbol);
    }
  }

  // ── Phase 2: FMP fallback for tickers Polygon missed ──
  if (needFallback.length > 0) {
    console.log(`[Gap Up] FMP fallback for ${needFallback.length} tickers…`);
    const batchSize = 5;
    let processed = 0;

    for (let i = 0; i < needFallback.length; i += batchSize) {
      const batch = needFallback.slice(i, i + batchSize);
      await Promise.all(batch.map(async (symbol) => {
        const q = await fetchFMPQuote(symbol);
        if (!q || !q.open || !q.previousClose || q.previousClose <= 0) return;
        const gapPct = ((q.open - q.previousClose) / q.previousClose) * 100;
        if (gapPct >= threshold) {
          results.push({
            symbol, price: q.price, change_pct: q.changesPercentage,
            volume: q.volume, avg_volume: q.avgVolume,
            open_price: q.open, prev_close: q.previousClose,
            gap_pct: parseFloat(gapPct.toFixed(2)), sector: q.sector,
          });
        }
      }));
      processed += batch.length;
      onProgress?.(50 + Math.round((processed / needFallback.length) * 50));
      if (i + batchSize < needFallback.length) await new Promise(r => setTimeout(r, 300));
    }
  }

  onProgress?.(100);
  console.log(`[Gap Up] Done — ${results.length} gap-ups found (Polygon: ${Object.keys(snapshots).length}, FMP fallback: ${needFallback.length})`);
  return results;
}

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
    rel_volume:  (h.volume && h.avg_volume && h.avg_volume > 0) ? parseFloat((h.volume / h.avg_volume).toFixed(2)) : null,
    open_price:  h.open_price,
    prev_close:  h.prev_close,
    gap_pct:     h.gap_pct,
    sector:      h.sector,
    notes:       `Open $${h.open_price.toFixed(2)} · Prev Close $${h.prev_close.toFixed(2)} · +${h.gap_pct.toFixed(2)}% gap`,
  }));

  const { error } = await supabase.from('breakout_alerts').insert(rows);
  if (error) { console.error('[Gap Up] Insert error:', error.message); throw error; }
  return { inserted: rows.length, hits };
}

// ══════════════════════════════════════════════════════════════════════════════
// VOL SURGE — Polygon snapshot (pre-filter) + Polygon aggs (avg volume)
// ══════════════════════════════════════════════════════════════════════════════

export async function scanVolSurge(multiplier = DEFAULT_VOL_MULTIPLIER, onProgress) {
  const alreadyAlerted = await getAlertedTodaySet('vol_surge');
  const candidates = SCREENER_TICKERS.filter(s => !alreadyAlerted.has(s));
  const results = [];

  // ── Phase 1: Polygon snapshot for current volumes ──
  onProgress?.(5);
  console.log(`[Vol Surge] Fetching Polygon snapshots for ${candidates.length} tickers…`);
  const snapshots = await fetchPolygonSnapshots(candidates);
  onProgress?.(25);

  // Pre-filter: only fetch historical aggs for tickers where today's volume
  // is at least as much as yesterday's (cheap heuristic to skip ~50% of tickers)
  const volumeCandidates = [];
  const noSnapshotTickers = [];

  for (const symbol of candidates) {
    const snap = snapshots[symbol];
    if (!snap || snap.volume == null || snap.volume <= 0) {
      noSnapshotTickers.push(symbol);
      continue;
    }
    // Pre-filter: today's vol >= yesterday's vol (surges will always pass this)
    if (snap.prevDayVolume != null && snap.volume < snap.prevDayVolume) continue;
    volumeCandidates.push({ symbol, ...snap });
  }

  console.log(`[Vol Surge] Pre-filter: ${volumeCandidates.length} candidates from ${candidates.length} (${noSnapshotTickers.length} need FMP fallback)`);

  // ── Phase 2: Fetch 20-day avg volume from Polygon aggs for candidates ──
  const batchSize = 5;
  let processed = 0;
  const totalWork = volumeCandidates.length + noSnapshotTickers.length;

  for (let i = 0; i < volumeCandidates.length; i += batchSize) {
    const batch = volumeCandidates.slice(i, i + batchSize);
    await Promise.all(batch.map(async (item) => {
      let avgVol = null;

      // Try Polygon aggs for 20-day avg volume
      const aggs = await fetchPolygonAggs(item.symbol, 21);
      if (aggs?.volumes) {
        // Exclude last day (today) from avg calculation
        const hist = aggs.volumes.slice(0, -1);
        if (hist.length > 0) {
          avgVol = Math.round(hist.reduce((s, v) => s + v, 0) / hist.length);
        }
      }

      // If Polygon aggs failed, try FMP for just this ticker
      if (avgVol == null) {
        const fmp = await fetchFMPQuote(item.symbol);
        avgVol = fmp?.avgVolume ?? null;
      }

      if (avgVol && avgVol > 0) {
        const ratio = item.volume / avgVol;
        if (ratio >= multiplier) {
          results.push({
            symbol: item.symbol, price: item.price,
            change_pct: item.changesPercentage,
            current_volume: item.volume, avg_volume: avgVol,
            volume_ratio: parseFloat(ratio.toFixed(2)),
            sector: null,
          });
        }
      }
    }));
    processed += batch.length;
    onProgress?.(25 + Math.round((processed / totalWork) * 70));
    if (i + batchSize < volumeCandidates.length) await new Promise(r => setTimeout(r, 300));
  }

  // ── Phase 3: FMP fallback for tickers with no Polygon snapshot ──
  if (noSnapshotTickers.length > 0) {
    console.log(`[Vol Surge] FMP fallback for ${noSnapshotTickers.length} tickers…`);
    for (let i = 0; i < noSnapshotTickers.length; i += batchSize) {
      const batch = noSnapshotTickers.slice(i, i + batchSize);
      await Promise.all(batch.map(async (symbol) => {
        const q = await fetchFMPQuote(symbol);
        if (!q || !q.volume || !q.avgVolume || q.avgVolume <= 0) return;
        const ratio = q.volume / q.avgVolume;
        if (ratio >= multiplier) {
          results.push({
            symbol, price: q.price, change_pct: q.changesPercentage,
            current_volume: q.volume, avg_volume: q.avgVolume,
            volume_ratio: parseFloat(ratio.toFixed(2)),
            sector: q.sector,
          });
        }
      }));
      processed += batch.length;
      onProgress?.(25 + Math.round((processed / totalWork) * 70));
      if (i + batchSize < noSnapshotTickers.length) await new Promise(r => setTimeout(r, 300));
    }
  }

  onProgress?.(100);
  console.log(`[Vol Surge] Done — ${results.length} surges found`);
  return results;
}

export async function runVolSurgeScan(multiplier = DEFAULT_VOL_MULTIPLIER, onProgress) {
  const hits = await scanVolSurge(multiplier, onProgress);
  if (hits.length === 0) return { inserted: 0, hits: [] };

  const rows = hits.map(h => ({
    signal_type:  'vol_surge',
    ticker:       h.symbol,
    price:        h.price,
    change_pct:   h.change_pct,
    volume:       h.current_volume,
    avg_volume:   h.avg_volume,
    rel_volume:   h.volume_ratio,
    volume_ratio: h.volume_ratio,
    sector:       h.sector,
    notes:        `Vol ${(h.current_volume / 1e6).toFixed(1)}M · Avg ${(h.avg_volume / 1e6).toFixed(1)}M · ${h.volume_ratio}x avg`,
  }));

  const { error } = await supabase.from('breakout_alerts').insert(rows);
  if (error) { console.error('[Vol Surge] Insert error:', error.message); throw error; }
  return { inserted: rows.length, hits };
}

// ══════════════════════════════════════════════════════════════════════════════
// 52W HIGH — Polygon snapshot (price) + Polygon aggs (year high), FMP fallback
// ══════════════════════════════════════════════════════════════════════════════

export async function scan52wHigh(threshold = DEFAULT_THRESHOLD, onProgress) {
  const alreadyAlerted = await getAlertedTodaySet('52w_high');
  const candidates = SCREENER_TICKERS.filter(s => !alreadyAlerted.has(s));
  const results = [];

  // ── Phase 1: Polygon snapshot for current prices ──
  onProgress?.(5);
  console.log(`[52W High] Fetching Polygon snapshots for ${candidates.length} tickers…`);
  const snapshots = await fetchPolygonSnapshots(candidates);
  onProgress?.(20);

  // ── Phase 2: Fetch 252-day highs from Polygon aggs per ticker ──
  const batchSize = 5;
  let processed = 0;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    await Promise.all(batch.map(async (symbol) => {
      const snap = snapshots[symbol];
      let price     = snap?.price ?? null;
      let volume    = snap?.volume ?? null;
      let changePct = snap?.changesPercentage ?? null;
      let yearHigh  = null;
      let avgVolume = null;
      let sector    = null;

      // Try Polygon aggs for 252-day high
      const aggs = await fetchPolygonAggs(symbol, 252);
      if (aggs?.highs && aggs.highs.length > 0) {
        yearHigh = Math.max(...aggs.highs);
        // Bonus: compute avg volume from the same data
        if (aggs.volumes) {
          const vols = aggs.volumes.slice(0, -1); // exclude today
          if (vols.length > 0) avgVolume = Math.round(vols.reduce((s, v) => s + v, 0) / vols.length);
        }
        // If no price from snapshot, use last close
        if (price == null && aggs.closes?.length > 0) {
          price = aggs.closes[aggs.closes.length - 1];
        }
      }

      // Fallback to FMP if Polygon failed
      if (yearHigh == null || price == null) {
        const fmp = await fetchFMPQuote(symbol);
        if (fmp) {
          if (price == null) price = fmp.price;
          if (yearHigh == null) yearHigh = fmp.yearHigh;
          if (avgVolume == null) avgVolume = fmp.avgVolume;
          if (volume == null) volume = fmp.volume;
          if (changePct == null) changePct = fmp.changesPercentage;
          sector = fmp.sector;
        }
      }

      if (!price || !yearHigh || yearHigh <= 0) return;

      const pctFromHigh = ((yearHigh - price) / yearHigh) * 100;
      if (pctFromHigh <= threshold) {
        results.push({
          symbol, price, change_pct: changePct,
          volume, avg_volume: avgVolume,
          high_52w: yearHigh,
          pct_from_high: parseFloat(pctFromHigh.toFixed(2)),
          sector,
        });
      }
    }));

    processed += batch.length;
    onProgress?.(20 + Math.round((processed / candidates.length) * 80));
    if (i + batchSize < candidates.length) await new Promise(r => setTimeout(r, 300));
  }

  onProgress?.(100);
  console.log(`[52W High] Done — ${results.length} near-high tickers found`);
  return results;
}

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
    rel_volume:    (h.volume && h.avg_volume && h.avg_volume > 0) ? parseFloat((h.volume / h.avg_volume).toFixed(2)) : null,
    high_52w:      h.high_52w,
    pct_from_high: h.pct_from_high,
    sector:        h.sector,
    notes:         `Price $${h.price.toFixed(2)} · 52W High $${h.high_52w.toFixed(2)} · ${h.pct_from_high.toFixed(2)}% away`,
  }));

  const { error } = await supabase.from('breakout_alerts').insert(rows);
  if (error) { console.error('[52W High] Insert error:', error.message); throw error; }
  return { inserted: rows.length, hits };
}

// ══════════════════════════════════════════════════════════════════════════════
// MA CROSS — Polygon aggs per ticker, snapshot for live price, FMP fallback
// ══════════════════════════════════════════════════════════════════════════════

export async function scanMACross(
  shortPeriod = DEFAULT_SHORT_MA,
  longPeriod  = DEFAULT_LONG_MA,
  onProgress
) {
  const alreadyAlerted = await getAlertedTodaySet('ma_cross');
  const candidates = SCREENER_TICKERS.filter(s => !alreadyAlerted.has(s));
  const results    = [];
  const daysNeeded = longPeriod + 1; // need longPeriod + 1 to compare today vs yesterday

  // Pre-fetch snapshots for live price/volume data
  console.log(`[MA Cross] Fetching Polygon snapshots for ${candidates.length} tickers…`);
  const snapshots = await fetchPolygonSnapshots(candidates);
  onProgress?.(10);

  const batchSize = 3; // smaller batches — historical endpoint is heavier
  let processed = 0;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    await Promise.all(batch.map(async (symbol) => {
      // Try Polygon aggs first
      let closes = null;
      const aggs = await fetchPolygonAggs(symbol, daysNeeded);
      if (aggs?.closes && aggs.closes.length >= daysNeeded) {
        closes = aggs.closes;
      }

      // Fallback to FMP historical
      if (!closes) {
        closes = await fetchFMPDailyCloses(symbol, daysNeeded);
      }

      if (!closes || closes.length < daysNeeded) return;

      // "today" = full array, "yesterday" = all but last
      const todayCloses    = closes;
      const yesterdayCloses = closes.slice(0, -1);

      const todayShort    = calcSMA(todayCloses,    shortPeriod);
      const todayLong     = calcSMA(todayCloses,    longPeriod);
      const yesterdayShort = calcSMA(yesterdayCloses, shortPeriod);
      const yesterdayLong  = calcSMA(yesterdayCloses, longPeriod);

      // Bullish crossover: yesterday short <= long, today short > long
      if (yesterdayShort <= yesterdayLong && todayShort > todayLong) {
        const snap = snapshots[symbol];
        results.push({
          symbol,
          price:           snap?.price ?? closes[closes.length - 1],
          change_pct:      snap?.changesPercentage ?? null,
          volume:          snap?.volume ?? null,
          avg_volume:      null,
          short_ma:        parseFloat(todayShort.toFixed(2)),
          long_ma:         parseFloat(todayLong.toFixed(2)),
          short_ma_period: shortPeriod,
          long_ma_period:  longPeriod,
          sector:          null,
        });
      }
    }));

    processed += batch.length;
    onProgress?.(10 + Math.round((processed / candidates.length) * 90));
    if (i + batchSize < candidates.length) await new Promise(r => setTimeout(r, 500));
  }

  onProgress?.(100);
  console.log(`[MA Cross] Done — ${results.length} crossovers found`);
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
    change_pct:      h.change_pct,
    volume:          h.volume,
    avg_volume:      h.avg_volume,
    rel_volume:      (h.volume && h.avg_volume && h.avg_volume > 0) ? parseFloat((h.volume / h.avg_volume).toFixed(2)) : null,
    short_ma:        h.short_ma,
    long_ma:         h.long_ma,
    short_ma_period: h.short_ma_period,
    long_ma_period:  h.long_ma_period,
    sector:          h.sector,
    notes:           `${h.short_ma_period}MA $${h.short_ma.toFixed(2)} · ${h.long_ma_period}MA $${h.long_ma.toFixed(2)} · bullish crossover`,
  }));

  const { error } = await supabase.from('breakout_alerts').insert(rows);
  if (error) { console.error('[MA Cross] Insert error:', error.message); throw error; }
  return { inserted: rows.length, hits };
}
