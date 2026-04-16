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
              vwap:              t.day?.vw ?? null,
              dayHigh:           t.day?.h ?? null,
              dayLow:            t.day?.l ?? null,
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
              vwap:              t.prevDay?.vw ?? null,
              dayHigh:           t.prevDay?.h ?? null,
              dayLow:            t.prevDay?.l ?? null,
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
        lows:    results.map(d => d.l),
        volumes: results.map(d => d.v),
        vwaps:   results.map(d => d.vw),
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

/**
 * Wilder smoothing RSI. Returns 0-100 or null if insufficient data.
 */
function calcRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  const slice = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  // Wilder smoothing for remaining candles beyond the seed period
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

/**
 * Standard ADX with +DI / -DI. Returns { adx, plusDI, minusDI } or null.
 */
function calcADX(highs, lows, closes, period = 14) {
  if (!highs || highs.length < period * 2) return null;
  const trArr = [], plusDMArr = [], minusDMArr = [];
  for (let i = 1; i < highs.length; i++) {
    const highDiff = highs[i] - highs[i - 1];
    const lowDiff  = lows[i - 1] - lows[i];
    trArr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    plusDMArr.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDMArr.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
  }
  // Seed with simple sum
  let smoothTR    = trArr.slice(0, period).reduce((s, v) => s + v, 0);
  let smoothPlus  = plusDMArr.slice(0, period).reduce((s, v) => s + v, 0);
  let smoothMinus = minusDMArr.slice(0, period).reduce((s, v) => s + v, 0);
  const dxArr = [];
  const addDX = () => {
    const plusDI  = smoothTR > 0 ? (smoothPlus  / smoothTR) * 100 : 0;
    const minusDI = smoothTR > 0 ? (smoothMinus / smoothTR) * 100 : 0;
    const sum = plusDI + minusDI;
    dxArr.push(sum > 0 ? Math.abs(plusDI - minusDI) / sum * 100 : 0);
  };
  addDX();
  for (let i = period; i < trArr.length; i++) {
    smoothTR    = smoothTR    - smoothTR    / period + trArr[i];
    smoothPlus  = smoothPlus  - smoothPlus  / period + plusDMArr[i];
    smoothMinus = smoothMinus - smoothMinus / period + minusDMArr[i];
    addDX();
  }
  if (dxArr.length < period) return null;
  const adx = parseFloat((dxArr.slice(-period).reduce((s, v) => s + v, 0) / period).toFixed(2));
  const plusDI  = smoothTR > 0 ? parseFloat(((smoothPlus  / smoothTR) * 100).toFixed(2)) : 0;
  const minusDI = smoothTR > 0 ? parseFloat(((smoothMinus / smoothTR) * 100).toFixed(2)) : 0;
  return { adx, plusDI, minusDI };
}

// Plain base-signal note for a single-signal ticker routed out of the
// confluence scan. Shape matches each base scanner's own `notes` line so
// the card is indistinguishable from a stand-alone base alert. Falls back
// to an empty string when sd lacks the field (defensive — callers should
// not rely on a particular shape, the cohort copy carries the real info).
function baseSignalNote(primary, sd) {
  const num = (v, d = 2) => (v == null || !Number.isFinite(Number(v))) ? null : Number(v).toFixed(d);
  switch (primary) {
    case 'gap_up': {
      const op = num(sd.open_price), pc = num(sd.prev_close), gp = num(sd.gap_pct);
      if (op && pc && gp) return `Open $${op} · Prev Close $${pc} · +${gp}% gap`;
      return gp ? `Gapped up ${gp}% at open` : '';
    }
    case 'vol_surge': {
      const cv = sd.current_volume ?? sd.volume, av = sd.avg_volume, vr = sd.volume_ratio;
      if (cv && av && vr) {
        return `Vol ${(cv / 1e6).toFixed(1)}M · Avg ${(av / 1e6).toFixed(1)}M · ${vr}x avg`;
      }
      return vr ? `${vr}x avg volume` : '';
    }
    case '52w_high': {
      const p = num(sd.price), hi = num(sd.high_52w), pf = num(sd.pct_from_high);
      if (p && hi && pf) return `Price $${p} · 52W High $${hi} · ${pf}% away`;
      return hi ? `At/near 52W high $${hi}` : '';
    }
    case 'ma_cross': {
      // Confluence merge doesn't carry short_ma_period/long_ma_period, so
      // use a simpler shape without the explicit day counts.
      const s = num(sd.short_ma), l = num(sd.long_ma);
      if (s && l) return `Short MA $${s} · Long MA $${l} · bullish crossover`;
      return 'Bullish MA crossover';
    }
    default:
      return '';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONFLUENCE SCAN — RSI + ADX + VWAP weighted scoring
// ══════════════════════════════════════════════════════════════════════════════

export async function runConfluenceScan(onProgress) {
  onProgress?.('Running 4 breakout scans…');

  // ── Step 1: run all 4 scan* functions in parallel ──
  const [hits52w, hitsVol, hitsGap, hitsMA] = await Promise.allSettled([
    scan52wHigh(),
    scanVolSurge(),
    scanGapUp(),
    scanMACross(),
  ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : []));

  onProgress?.('Merging signals…');

  // ── Step 2: merge results by ticker into a Map ──
  const tickerMap = new Map(); // ticker → { signals: Set, data: {...} }

  const merge = (hits, signalKey, dataFn) => {
    for (const h of hits) {
      if (!tickerMap.has(h.symbol)) {
        tickerMap.set(h.symbol, { signals: new Set(), snapData: h });
      }
      const entry = tickerMap.get(h.symbol);
      entry.signals.add(signalKey);
      Object.assign(entry.snapData, dataFn(h));
    }
  };

  merge(hits52w, '52w_high',  h => ({ high_52w: h.high_52w, pct_from_high: h.pct_from_high, price: h.price, volume: h.volume, avg_volume: h.avg_volume, change_pct: h.change_pct, sector: h.sector }));
  merge(hitsVol, 'vol_surge', h => ({ current_volume: h.current_volume, avg_volume: h.avg_volume, volume_ratio: h.volume_ratio, price: h.price, change_pct: h.change_pct }));
  merge(hitsGap, 'gap_up',    h => ({ gap_pct: h.gap_pct, open_price: h.open_price, prev_close: h.prev_close, price: h.price, volume: h.volume, change_pct: h.change_pct }));
  merge(hitsMA,  'ma_cross',  h => ({ short_ma: h.short_ma, long_ma: h.long_ma, price: h.price, volume: h.volume, change_pct: h.change_pct }));

  const tickers = [...tickerMap.keys()];
  onProgress?.(`Fetching RSI/ADX/VWAP for ${tickers.length} tickers…`);

  // ── Step 3: fetch RSI, ADX, VWAP (batched 5 at a time) ──
  const BATCH = 5;
  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    await Promise.all(batch.map(async (ticker) => {
      const entry = tickerMap.get(ticker);
      // fetch 60 days for enough ADX history (needs ~28+ candles)
      const aggs = await fetchPolygonAggs(ticker, 60);
      if (aggs) {
        entry.rsi   = calcRSI(aggs.closes);
        entry.adx   = calcADX(aggs.highs, aggs.lows, aggs.closes);
        entry.vwap  = aggs.vwaps?.[aggs.vwaps.length - 1] ?? null;
      }
      // Also grab snapshot vwap as fallback
      if (!entry.vwap) {
        const snaps = await fetchPolygonSnapshots([ticker]);
        entry.vwap = snaps[ticker]?.vwap ?? null;
      }
    }));
    if (i + BATCH < tickers.length) await new Promise(r => setTimeout(r, 300));
    onProgress?.(`RSI/ADX/VWAP: ${Math.min(i + BATCH, tickers.length)}/${tickers.length}`);
  }

  // ── Step 4: score each ticker ──
  const SIGNAL_WEIGHTS = { '52w_high': 25, 'vol_surge': 25, 'gap_up': 20, 'ma_cross': 15 };

  const confluenceResults = [];
  for (const [ticker, entry] of tickerMap.entries()) {
    let score = 0;

    // Signal scores
    for (const sig of entry.signals) score += SIGNAL_WEIGHTS[sig] ?? 0;

    // RSI score
    const rsi = entry.rsi;
    if (rsi != null) {
      if      (rsi >= 50 && rsi <= 70) score += 10;
      else if (rsi >= 40 && rsi < 50)  score += 3;
      else if (rsi > 70)               score -= 5;
    }

    // ADX score
    const adxData = entry.adx;
    if (adxData != null) {
      const bullish = adxData.plusDI > adxData.minusDI;
      if (adxData.adx >= 25 && bullish) {
        score += 10;
        if (adxData.adx >= 40) score += 3;
      } else if (adxData.adx >= 25 && !bullish) {
        score += 2;
      } else if (adxData.adx < 20) {
        score -= 5;
      }
    }

    // VWAP score
    const price = entry.snapData.price;
    const vwap  = entry.vwap;
    if (price != null && vwap != null && vwap > 0) {
      if (price > vwap) score += 7;
      else              score -= 3;
    }

    // Rel volume bonus
    const volRatio = entry.snapData.volume_ratio ?? (entry.snapData.current_volume && entry.snapData.avg_volume && entry.snapData.avg_volume > 0
      ? entry.snapData.current_volume / entry.snapData.avg_volume
      : entry.snapData.volume && entry.snapData.avg_volume && entry.snapData.avg_volume > 0
        ? entry.snapData.volume / entry.snapData.avg_volume
        : null);
    if (volRatio != null) {
      if (volRatio > 3) score += 3;
      if (volRatio > 5) score += 3;
    }

    // Within 1% of 52W high bonus
    const pctFromHigh = entry.snapData.pct_from_high;
    if (pctFromHigh != null && pctFromHigh < 1) score += 2;

    // Gap >3% bonus
    const gapPct = entry.snapData.gap_pct;
    if (gapPct != null && gapPct > 3) score += 2;

    // Clamp to 0-100
    score = Math.max(0, Math.min(100, score));

    // Tier assignment — CONFLUENCE means two things must be true:
    //   (a) at least two base signals actually fired, and
    //   (b) score >= 50 (S requires >= 75).
    //
    // Rule (a) is the language contract: "confluence" means "flowing
    // together" — one base signal can't flow together with itself. Before
    // this rule, a 52W High with strong RSI/ADX/VWAP could clear 50 on
    // bonuses alone (e.g. ASLB: 25 + 29 bonus points = 54) and earn a
    // CONFLUENCE badge despite only one component firing. That trained
    // users to distrust the badge.
    //
    // Rule (b) prevents weak 2-signal pairs (gap_up 20 + ma_cross 15 = 35
    // base) from riding under the label on the strength of two mediocre
    // signals alone. Score >= 50 with two components means either a
    // strong pair (52w+vol = 50 base) or a moderate pair plus real
    // technical confirmation.
    //
    // Everything that fails either gate routes to its highest-weighted
    // component signal in step 5, landing in a mature base cohort instead
    // of the starvation-prone 'confluence' bucket.
    let tier = null;
    if (entry.signals.size >= 2) {
      if      (score >= 75) tier = 'S';
      else if (score >= 50) tier = 'A';
    }
    // else: tier stays null → this ticker will NOT produce a confluence row.

    confluenceResults.push({ ticker, score, tier, signals: [...entry.signals], rsi, adxData, vwap, snapData: entry.snapData });
  }

  // Sort by score descending
  confluenceResults.sort((a, b) => b.score - a.score);

  // Top 4 are featured
  const featuredTickers = new Set(confluenceResults.slice(0, 4).map(r => r.ticker));

  onProgress?.('Inserting alerts…');

  // ── Step 5: insert ONE row per ticker, choosing signal_type by tier ───
  //
  // CHANGED 2026-04-15 (part 1): we used to insert one row per component
  // signal PLUS the summary row. That contaminated base-signal cohorts
  // (gap_up's hit rate counted confluence-tagged gap_ups) and encoded
  // tier/score/signals as regex-parsed free text in `notes`. Now we write
  // structured columns (confluence_tier, confluence_score,
  // component_signals). Migration 20260415120000 adds the columns +
  // backfills historical data.
  //
  // CHANGED 2026-04-15 (part 2): raise the tier threshold so CONFLUENCE
  // means conviction. SIGNAL_WEIGHTS cap a single base signal at 25 pts,
  // so score ≥ 50 requires either two components firing or one component
  // plus strong RSI/ADX/VWAP enhancement. Tickers that score below 50 are
  // still useful signals, just not confluence-grade — route them to their
  // highest-weighted component signal (e.g. '52w_high' or 'gap_up') so
  // they land in a mature cohort the UI can actually narrate against.
  // Otherwise they'd sit in the 'confluence' cohort with copy like
  // "Building history · 0 of 50" which trains users to distrust the app.

  // Pre-fetch today's already-alerted sets per base signal so we don't
  // double-insert if runGapUpScan (etc.) already fired for this ticker
  // earlier in the day. runConfluenceScan inserts under a base signal
  // only when the base scanner hasn't already claimed the ticker.
  const baseSignalSets = {};
  const baseSignalsNeeded = new Set();
  for (const r of confluenceResults) {
    if (r.tier == null) {
      const primary = [...r.signals].sort(
        (a, b) => (SIGNAL_WEIGHTS[b] ?? 0) - (SIGNAL_WEIGHTS[a] ?? 0)
      )[0];
      if (primary) baseSignalsNeeded.add(primary);
    }
  }
  await Promise.all(
    [...baseSignalsNeeded].map(async (sig) => {
      baseSignalSets[sig] = await getAlertedTodaySet(sig);
    })
  );

  const insertRows = [];
  let routedToBase = 0;
  let skippedDuplicate = 0;

  for (const r of confluenceResults) {
    const sd = r.snapData;
    const relVol = sd.volume_ratio ?? (sd.current_volume && sd.avg_volume
      ? parseFloat((sd.current_volume / sd.avg_volume).toFixed(2))
      : (sd.volume && sd.avg_volume
          ? parseFloat((sd.volume / sd.avg_volume).toFixed(2))
          : null));

    // Shared fields — identical shape whether we file this as confluence
    // or as a base-signal row.
    const baseRow = {
      ticker:         r.ticker,
      price:          sd.price,
      change_pct:     sd.change_pct,
      volume:         sd.current_volume ?? sd.volume,
      avg_volume:     sd.avg_volume,
      rel_volume:     relVol,
      high_52w:       sd.high_52w ?? null,
      pct_from_high:  sd.pct_from_high ?? null,
      gap_pct:        sd.gap_pct ?? null,
      open_price:     sd.open_price ?? null,
      prev_close:     sd.prev_close ?? null,
      short_ma:       sd.short_ma ?? null,
      long_ma:        sd.long_ma ?? null,
      volume_ratio:   sd.volume_ratio ?? null,
      sector:         sd.sector ?? null,
    };

    if (r.tier != null) {
      // Path A: tier S or A → file as confluence.
      insertRows.push({
        ...baseRow,
        signal_type:       'confluence',
        conviction:        r.tier,
        featured:          featuredTickers.has(r.ticker),
        // Structured confluence columns — what the UI reads.
        confluence_tier:   r.tier,
        confluence_score:  r.score,
        component_signals: r.signals,   // text[] → ['gap_up','52w_high',…]
        // Notes is decorative / human-readable only. UI must NOT parse it.
        notes: `Tier ${r.tier} · Score ${r.score} · RSI ${r.rsi ?? 'n/a'} · ADX ${r.adxData?.adx ?? 'n/a'} · ${r.signals.join(' + ')}`,
      });
      continue;
    }

    // Path B: tier is null (score < 50) → route to the highest-weighted
    // component signal so the ticker lands in a mature cohort.
    const primary = [...r.signals].sort(
      (a, b) => (SIGNAL_WEIGHTS[b] ?? 0) - (SIGNAL_WEIGHTS[a] ?? 0)
    )[0];
    if (!primary) continue;   // no recognized signal — nothing to file under

    // Dedup against the stand-alone base scanner that may have already
    // inserted this ticker earlier today.
    if (baseSignalSets[primary]?.has(r.ticker)) {
      skippedDuplicate++;
      continue;
    }
    baseSignalSets[primary].add(r.ticker);   // block further dupes within this run

    // Notes copy — two cases:
    //   • Multi-signal route: keep the honest "Multi-signal N/100" line —
    //     e.g. CRWD fires Gap Up + MA Cross; the card benefits from the
    //     extra context that it's a confluence-scanned but sub-threshold.
    //   • Single-signal route: write the plain base-signal note (same
    //     shape runGapUpScan / runVolSurgeScan / etc. use). This is the
    //     NET case — only Gap Up fired, so calling it "Multi-signal" was
    //     flatly wrong. Matching the base scanner's notes means the card
    //     reads identically to a stand-alone base-signal alert.
    let routedNotes;
    if (r.signals.length >= 2) {
      routedNotes = `Multi-signal ${r.score}/100 (${r.signals.join(' + ')}) · routed under ${primary} (below confluence tier threshold)`;
    } else {
      routedNotes = baseSignalNote(primary, sd);
    }

    insertRows.push({
      ...baseRow,
      signal_type: primary,
      // conviction / featured / confluence_* intentionally left null —
      // this is a plain base-signal row, not a confluence row. It shares
      // the base cohort's hit-rate copy and lifecycle thresholds.
      notes: routedNotes,
    });
    routedToBase++;
  }

  let inserted = 0;
  if (insertRows.length > 0) {
    const { error } = await supabase.from('breakout_alerts').insert(insertRows);
    if (error) { console.error('[Confluence] Insert error:', error.message); throw error; }
    inserted = insertRows.length;
  }

  const confluenceCount = inserted - routedToBase;
  const summary =
    `Done — ${confluenceResults.length} tickers scored, ` +
    `${confluenceCount} confluence (A/S), ` +
    `${routedToBase} routed to base signal, ` +
    `${skippedDuplicate} skipped as duplicate`;
  onProgress?.(summary);
  console.log(`[Confluence] ${summary}`);
  return { inserted, confluenceResults, confluenceCount, routedToBase, skippedDuplicate };
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
      let aggVolumes = null;
      const aggs = await fetchPolygonAggs(symbol, daysNeeded);
      if (aggs?.closes && aggs.closes.length >= daysNeeded) {
        closes = aggs.closes;
        aggVolumes = aggs.volumes ?? null;
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

        // Compute trailing avg daily volume (exclude today) from Polygon aggs
        // Matches the pattern vol_surge uses so the "Nx avg" ratio is comparable.
        let avgVol = null;
        if (aggVolumes && aggVolumes.length > 1) {
          const hist = aggVolumes.slice(0, -1); // exclude today
          const sum  = hist.reduce((s, v) => s + (Number(v) || 0), 0);
          if (sum > 0) avgVol = Math.round(sum / hist.length);
        }

        results.push({
          symbol,
          price:           snap?.price ?? closes[closes.length - 1],
          change_pct:      snap?.changesPercentage ?? null,
          volume:          snap?.volume ?? (aggVolumes ? aggVolumes[aggVolumes.length - 1] : null),
          avg_volume:      avgVol,
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

  const rows = hits.map(h => {
    const ratio = (h.volume && h.avg_volume && h.avg_volume > 0)
      ? parseFloat((h.volume / h.avg_volume).toFixed(2))
      : null;
    return {
      signal_type:     'ma_cross',
      ticker:          h.symbol,
      price:           h.price,
      change_pct:      h.change_pct,
      volume:          h.volume,
      avg_volume:      h.avg_volume,
      rel_volume:      ratio,
      volume_ratio:    ratio,
      short_ma:        h.short_ma,
      long_ma:         h.long_ma,
      short_ma_period: h.short_ma_period,
      long_ma_period:  h.long_ma_period,
      sector:          h.sector,
      notes:           `${h.short_ma_period}MA $${h.short_ma.toFixed(2)} · ${h.long_ma_period}MA $${h.long_ma.toFixed(2)} · bullish crossover`,
    };
  });

  const { error } = await supabase.from('breakout_alerts').insert(rows);
  if (error) { console.error('[MA Cross] Insert error:', error.message); throw error; }
  return { inserted: rows.length, hits };
}
