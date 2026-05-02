// ============================================
// UPTIKALERTS — scan-confluence Edge Function
//
// Server-side port of runConfluenceScan from src/lib/breakoutScanner.js.
// Fires four base scans (52w_high, vol_surge, gap_up, ma_cross) inline
// against the same ~250-ticker S&P 500 + Nasdaq 100 universe used by the
// client-side scanner, merges hits by ticker, fetches RSI/ADX/VWAP per
// survivor (batched 5 at a time, 300ms between batches), scores them on
// the same weights as the client, and writes confluence rows to
// breakout_alerts when the score clears the tier floor.
//
// Why the port: the client-side scanner only fires when an admin clicks
// the button in AdminPanel.jsx. Most days nobody clicks it, and confluence
// rows accumulate sporadically — sometimes none for days. The cron
// migration that ships alongside this function calls it hourly during
// market hours so confluence is a reliable, automated signal source
// instead of an admin chore. Same edge-function shape as fetch-flow-data
// and scan-vol-surge: Polygon snapshot + aggs, Supabase service-role
// inserts, force=true bypasses the market-hours guard.
//
// Schema note: rsi/adx/vwap are NOT columns in breakout_alerts (only
// confluence_tier / confluence_score / component_signals exist as
// structured columns from migration 20260415120000). RSI/ADX/VWAP are
// embedded in the human-readable `notes` field, matching the pattern the
// client-side runConfluenceScan uses. Adding them as typed columns would
// require a separate migration outside this PR's scope.
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Polygon config ───────────────────────────────────────────────────────────
const POLYGON_BASE  = 'https://api.polygon.io';
const POLY_DELAY_MS = 300;   // ~3 req/s — stays within free tier
const BATCH_SIZE    = 5;     // matches client-side runConfluenceScan
const SNAPSHOT_BATCH = 80;   // ~80 tickers × 5 chars stays under URL limits

// ── Scan thresholds (match breakoutScanner.js defaults) ──────────────────────
const THRESHOLD_52W   = 5.0;  // 52W High: within 5%
const VOL_MULTIPLIER  = 2.0;  // Vol Surge: 2x avg
const GAP_THRESHOLD   = 1.5;  // Gap Up: 1.5%
const SHORT_MA        = 9;    // MA Cross short period
const LONG_MA         = 21;   // MA Cross long period

// ── Confluence scoring weights (per spec) ────────────────────────────────────
const SIGNAL_WEIGHTS: Record<string, number> = {
  '52w_high': 25,
  'vol_surge': 25,
  'gap_up':    20,
  'ma_cross':  15,
};

// ── Tier cutoffs (per spec: S ≥85, A ≥70, B ≥55. Drop below 55) ─────────────
const TIER_S_FLOOR = 85;
const TIER_A_FLOOR = 70;
const TIER_B_FLOOR = 55;

// ── ETFs / indexes that must never become confluence alerts ─────────────────
// Copied from fetch-flow-data/index.ts so the two scanners exclude the same
// universe and SPY/QQQ/etc never sneak in via a Polygon snapshot quirk.
const EXCLUDED_TICKERS = new Set<string>([
  // Major indexes & broad ETFs
  'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'SPX', 'SPXW', 'NDX',
  // Sector ETFs (Select Sector SPDRs)
  'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLU', 'XLP', 'XLY', 'XLB', 'XLRE',
  // Commodity & bond ETFs
  'GLD', 'SLV', 'USO', 'TLT', 'HYG', 'LQD', 'EEM', 'EFA', 'VXX',
  // Leveraged & inverse ETFs
  'SOXL', 'SOXS', 'TQQQ', 'SQQQ', 'UVXY', 'SVXY', 'ARKK',
  // Thematic / international ETFs
  'SMH', 'KWEB', 'FXI', 'BITO', 'IBIT', 'GDX', 'GDXJ',
  // Index symbols
  'VIX', 'RUT', 'OEX', 'XSP',
  // SPDR portfolio ETFs & Dimensional ETFs
  'SPYM', 'SPMD', 'SPLG', 'SPDW', 'SPEM', 'SPTM', 'SPTL', 'SPAB', 'SPSM',
  'DFUS', 'DFAS', 'DFAI', 'DFAC', 'DFAT', 'DFIV', 'DFAE', 'DFAU',
  // Additional broad / factor ETFs commonly in flow
  'RSP', 'SCHD', 'JEPI', 'JEPQ', 'DIVO', 'VIG', 'VUG', 'VTV', 'VGT',
  'VXUS', 'VEA', 'VWO', 'BND', 'VCIT', 'AGG', 'IEF', 'SHY', 'TIP',
  'XBI', 'IBB', 'HACK', 'BOTZ', 'ROBO', 'DRIV', 'LIT', 'TAN', 'ICLN',
  'JETS', 'PBW', 'ARKG', 'ARKW', 'ARKF', 'ARKQ',
]);

// ── Universe: S&P 500 + Nasdaq 100, ported from src/lib/screener.js ─────────
// Edge functions can't import from src/, so the list is duplicated here.
// Keep in sync with SCREENER_TICKERS when that file changes.
const TICKERS: string[] = [
  // Tech
  'AAPL','MSFT','NVDA','GOOGL','GOOG','META','AVGO','ORCL','AMD','QCOM',
  'INTC','TXN','MU','AMAT','KLAC','LRCX','ADI','MCHP','SNPS','CDNS',
  'FTNT','PANW','CRWD','ZS','SNOW','PLTR','NOW','CRM','ADBE','INTU',
  'TEAM','WDAY','DDOG','HUBS','MDB','NET','VEEV','ROP','ANSS','PTC',
  // Healthcare
  'LLY','UNH','JNJ','ABBV','MRK','TMO','ABT','DHR','BMY','AMGN',
  'GILD','ISRG','SYK','BSX','MDT','ELV','CI','CVS','HUM','CNC',
  'BIIB','REGN','VRTX','MRNA','ILMN','A','IQV','DXCM','PODD','IDXX',
  // Finance
  'BRK.B','JPM','BAC','WFC','GS','MS','BLK','SCHW','AXP','COF',
  'USB','PNC','TFC','SPGI','MCO','ICE','CME','MSCI','FIS','FI',
  'MA','V','PYPL','XYZ','COIN',
  // Energy
  'XOM','CVX','COP','EOG','SLB','MPC','PSX','VLO','OXY',
  'HAL','DVN','FANG','HES','BKR','CTRA','EQT','APA','MRO','NOV',
  // Industrial
  'GE','HON','UPS','CAT','DE','LMT','RTX','NOC','GD','BA',
  'EMR','ETN','PH','ITW','ROK','XYL','IR','CARR','OTIS','TT',
  'FDX','DAL','UAL','ALK','AAL','CSX','UNP','NSC','CHRW','EXPD',
  // Consumer
  'AMZN','TSLA','HD','MCD','NKE','SBUX','TGT','WMT','COST','TJX',
  'LOW','BKNG','MAR','HLT','YUM','DPZ','CMG','ROST','EBAY','ETSY',
  'DKNG','ABNB','UBER','LYFT','DASH',
  // Communication
  'NFLX','DIS','CHTR','TMUS','VZ','T','CMCSA','EA','TTWO',
  'SNAP','PINS','RBLX','WBD','FOX','FOXA',
  'LYV','MTCH','IPG','OMC',
  // Utilities
  'NEE','DUK','SO','D','AEP','XEL','ED','EXC','SRE','PEG',
  'AWK','ES','WEC','ETR','PPL','CMS','NI','AES','FE','CNP',
  // Materials
  'LIN','APD','SHW','ECL','DD','DOW','NEM','FCX','ALB','CF',
  'MOS','FMC','IFF','PPG','VMC','MLM','NUE','STLD','RS','BALL',
  // Real Estate
  'AMT','PLD','CCI','EQIX','PSA','WELL','DLR','SPG','O','EQR',
  'AVB','VTR','BXP','KIM','REG','FRT','HST','MAA','UDR','CPT',
];

// ── Market hours guard ───────────────────────────────────────────────────────
// Uses Intl.DateTimeFormat with timeZone: America/New_York so the EDT/EST
// switch is handled automatically. Does not need updating when DST changes.
function isMarketHours(): boolean {
  // Get current ET (handles EDT/EST automatically via IANA tzdb)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const weekday = parts.find(p => p.type === 'weekday')?.value;
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const hour   = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  const etMinutes = hour * 60 + minute;

  // Market hours: 9:30 AM - 4:00 PM ET
  return etMinutes >= 9 * 60 + 30 && etMinutes < 16 * 60;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Polygon helpers ──────────────────────────────────────────────────────────

// 10-second per-request timeout. Without it a slow Polygon endpoint can
// hang the whole scan past the cron cadence (and past Supabase's edge
// function wall-clock limit) instead of failing fast and letting the
// next cron tick retry.
const FETCH_TIMEOUT_MS = 10_000;

async function polyGet(path: string, apiKey: string): Promise<any> {
  // Bearer header instead of ?apiKey= query param so the key never
  // lands in URL access logs or stack traces. Polygon supports both.
  const res = await fetch(`${POLYGON_BASE}${path}`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 429) {
    throw new Error('Polygon rate limit — back off and retry next cycle');
  }
  if (!res.ok) {
    throw new Error(`Polygon HTTP ${res.status}: ${res.statusText} (${path})`);
  }
  return res.json();
}

interface SnapData {
  price: number | null;
  open: number | null;
  previousClose: number | null;
  volume: number | null;
  prevDayVolume: number | null;
  changesPercentage: number | null;
  vwap: number | null;
  dayHigh: number | null;
  dayLow: number | null;
}

// Batched snapshot — one HTTP call per ~80 tickers. Returns a map keyed by
// ticker symbol. Tickers that didn't return a usable quote are simply
// absent from the map.
async function fetchPolygonSnapshots(
  symbols: string[],
  apiKey: string,
): Promise<Map<string, SnapData>> {
  const map = new Map<string, SnapData>();

  for (let i = 0; i < symbols.length; i += SNAPSHOT_BATCH) {
    const batch = symbols.slice(i, i + SNAPSHOT_BATCH);
    try {
      const data = await polyGet(
        `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${batch.join(',')}`,
        apiKey,
      );
      for (const t of (data?.tickers ?? [])) {
        const dayVol  = t.day?.v  ?? 0;
        const prevVol = t.prevDay?.v ?? 0;
        if (dayVol > 0) {
          map.set(t.ticker, {
            price:             t.day?.c ?? null,
            open:              t.day?.o ?? null,
            previousClose:     t.prevDay?.c ?? null,
            volume:            Math.round(dayVol),
            prevDayVolume:     prevVol > 0 ? Math.round(prevVol) : null,
            changesPercentage: t.todaysChangePerc ?? null,
            vwap:              t.day?.vw ?? null,
            dayHigh:           t.day?.h ?? null,
            dayLow:            t.day?.l ?? null,
          });
        } else if (prevVol > 0) {
          map.set(t.ticker, {
            price:             t.prevDay?.c ?? null,
            open:              t.prevDay?.o ?? null,
            previousClose:     null,
            volume:            Math.round(prevVol),
            prevDayVolume:     null,
            changesPercentage: t.todaysChangePerc ?? null,
            vwap:              t.prevDay?.vw ?? null,
            dayHigh:           t.prevDay?.h ?? null,
            dayLow:            t.prevDay?.l ?? null,
          });
        }
      }
    } catch (e) {
      console.warn(`[confluence] Snapshot batch ${i}-${i + batch.length} failed:`, (e as Error).message);
    }
  }
  return map;
}

interface AggsData {
  closes:  number[];
  highs:   number[];
  lows:    number[];
  volumes: number[];
  vwaps:   number[];
}

async function fetchPolygonAggs(
  symbol: string,
  days: number,
  apiKey: string,
): Promise<AggsData | null> {
  try {
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - Math.ceil(days * 1.8) * 86400000);
    const from = fromDate.toISOString().split('T')[0];

    const data = await polyGet(
      `/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=${days + 15}`,
      apiKey,
    );
    if (data?.results && data.results.length >= days) {
      const results = data.results.slice(-days);
      return {
        closes:  results.map((d: any) => d.c),
        highs:   results.map((d: any) => d.h),
        lows:    results.map((d: any) => d.l),
        volumes: results.map((d: any) => d.v),
        vwaps:   results.map((d: any) => d.vw),
      };
    }
    return null;
  } catch (e) {
    console.warn(`[confluence] Aggs failed for ${symbol}:`, (e as Error).message);
    return null;
  }
}

// ── Indicator math (ports from breakoutScanner.js) ───────────────────────────

function calcSMA(closes: number[], period: number): number {
  const slice = closes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

function calcRSI(closes: number[], period = 14): number | null {
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

interface ADXData {
  adx: number;
  plusDI: number;
  minusDI: number;
}

function calcADX(highs: number[], lows: number[], closes: number[], period = 14): ADXData | null {
  if (!highs || highs.length < period * 2) return null;
  const trArr: number[] = [];
  const plusDMArr: number[] = [];
  const minusDMArr: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const highDiff = highs[i] - highs[i - 1];
    const lowDiff  = lows[i - 1] - lows[i];
    trArr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i]  - closes[i - 1]),
    ));
    plusDMArr.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDMArr.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
  }
  let smoothTR    = trArr.slice(0, period).reduce((s, v) => s + v, 0);
  let smoothPlus  = plusDMArr.slice(0, period).reduce((s, v) => s + v, 0);
  let smoothMinus = minusDMArr.slice(0, period).reduce((s, v) => s + v, 0);
  const dxArr: number[] = [];
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

// ── Already-alerted lookup ───────────────────────────────────────────────────

async function getAlertedTodaySet(
  supabase: ReturnType<typeof createClient>,
  signalType: string,
): Promise<Set<string>> {
  const now = new Date();
  const startOfDayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const { data, error } = await supabase
    .from('breakout_alerts')
    .select('ticker')
    .eq('signal_type', signalType)
    .gte('created_at', startOfDayUTC.toISOString());
  if (error) {
    console.warn(`[confluence] alerted-today lookup ${signalType}:`, error.message);
    return new Set<string>();
  }
  const set = new Set<string>();
  for (const row of (data || [])) {
    if (row.ticker) set.add(row.ticker);
  }
  return set;
}

// ── Base scan: 52-week high ──────────────────────────────────────────────────
// Uses Polygon aggs for the 252-day high. Returns hits within
// THRESHOLD_52W percent of the high.
interface Hit52w {
  symbol: string;
  price: number;
  change_pct: number | null;
  volume: number | null;
  avg_volume: number | null;
  high_52w: number;
  pct_from_high: number;
}

async function scan52WeekHigh(
  snapshots: Map<string, SnapData>,
  apiKey: string,
): Promise<Hit52w[]> {
  const hits: Hit52w[] = [];
  const symbols = TICKERS.filter((s) => !EXCLUDED_TICKERS.has(s));

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (symbol) => {
      const snap = snapshots.get(symbol);
      let price     = snap?.price     ?? null;
      let volume    = snap?.volume    ?? null;
      let changePct = snap?.changesPercentage ?? null;

      const aggs = await fetchPolygonAggs(symbol, 252, apiKey);
      if (!aggs?.highs?.length) return;

      const yearHigh = Math.max(...aggs.highs);
      let avgVolume: number | null = null;
      if (aggs.volumes?.length > 1) {
        const vols = aggs.volumes.slice(0, -1);
        if (vols.length > 0) avgVolume = Math.round(vols.reduce((s, v) => s + v, 0) / vols.length);
      }
      if (price == null && aggs.closes?.length > 0) price = aggs.closes[aggs.closes.length - 1];

      if (!price || !yearHigh || yearHigh <= 0) return;
      const pctFromHigh = ((yearHigh - price) / yearHigh) * 100;
      if (pctFromHigh <= THRESHOLD_52W) {
        hits.push({
          symbol,
          price,
          change_pct: changePct,
          volume,
          avg_volume: avgVolume,
          high_52w: yearHigh,
          pct_from_high: parseFloat(pctFromHigh.toFixed(2)),
        });
      }
    }));
    if (i + BATCH_SIZE < symbols.length) await sleep(POLY_DELAY_MS);
  }
  return hits;
}

// ── Base scan: volume surge ──────────────────────────────────────────────────
// Uses snapshot's day volume vs avg of prior 20 days from aggs.
interface HitVolSurge {
  symbol: string;
  price: number;
  change_pct: number | null;
  current_volume: number;
  avg_volume: number;
  volume_ratio: number;
}

async function scanVolSurge(
  snapshots: Map<string, SnapData>,
  apiKey: string,
): Promise<HitVolSurge[]> {
  const hits: HitVolSurge[] = [];
  const symbols = TICKERS.filter((s) => !EXCLUDED_TICKERS.has(s));

  // Pre-filter: ticker must have a snapshot with non-zero volume, and
  // today's volume must be at least yesterday's (cheap heuristic to skip
  // ~50% of the universe before the more expensive aggs call).
  const candidates: { symbol: string; snap: SnapData }[] = [];
  for (const symbol of symbols) {
    const snap = snapshots.get(symbol);
    if (!snap || snap.volume == null || snap.volume <= 0) continue;
    if (snap.prevDayVolume != null && snap.volume < snap.prevDayVolume) continue;
    candidates.push({ symbol, snap });
  }

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async ({ symbol, snap }) => {
      const aggs = await fetchPolygonAggs(symbol, 21, apiKey);
      if (!aggs?.volumes?.length) return;
      const hist = aggs.volumes.slice(0, -1); // exclude today
      if (hist.length === 0) return;
      const avgVol = Math.round(hist.reduce((s, v) => s + v, 0) / hist.length);
      if (avgVol <= 0 || snap.volume == null || snap.price == null) return;
      const ratio = snap.volume / avgVol;
      if (ratio >= VOL_MULTIPLIER) {
        hits.push({
          symbol,
          price: snap.price,
          change_pct: snap.changesPercentage,
          current_volume: snap.volume,
          avg_volume: avgVol,
          volume_ratio: parseFloat(ratio.toFixed(2)),
        });
      }
    }));
    if (i + BATCH_SIZE < candidates.length) await sleep(POLY_DELAY_MS);
  }
  return hits;
}

// ── Base scan: gap up ────────────────────────────────────────────────────────
// Snapshot-only: open vs previousClose. No aggs needed.
interface HitGapUp {
  symbol: string;
  price: number;
  change_pct: number | null;
  volume: number | null;
  open_price: number;
  prev_close: number;
  gap_pct: number;
}

function scanGapUp(snapshots: Map<string, SnapData>): HitGapUp[] {
  const hits: HitGapUp[] = [];
  for (const symbol of TICKERS) {
    if (EXCLUDED_TICKERS.has(symbol)) continue;
    const snap = snapshots.get(symbol);
    if (!snap || snap.open == null || snap.previousClose == null || snap.previousClose <= 0 || snap.price == null) continue;
    const gapPct = ((snap.open - snap.previousClose) / snap.previousClose) * 100;
    if (gapPct >= GAP_THRESHOLD) {
      hits.push({
        symbol,
        price:      snap.price,
        change_pct: snap.changesPercentage,
        volume:     snap.volume,
        open_price: snap.open,
        prev_close: snap.previousClose,
        gap_pct:    parseFloat(gapPct.toFixed(2)),
      });
    }
  }
  return hits;
}

// ── Base scan: MA cross (9/21 bullish crossover) ─────────────────────────────
interface HitMACross {
  symbol: string;
  price: number;
  change_pct: number | null;
  volume: number | null;
  short_ma: number;
  long_ma: number;
}

async function scanMACross(
  snapshots: Map<string, SnapData>,
  apiKey: string,
): Promise<HitMACross[]> {
  const hits: HitMACross[] = [];
  const symbols = TICKERS.filter((s) => !EXCLUDED_TICKERS.has(s));
  const daysNeeded = LONG_MA + 1;

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (symbol) => {
      const aggs = await fetchPolygonAggs(symbol, daysNeeded, apiKey);
      if (!aggs?.closes || aggs.closes.length < daysNeeded) return;
      const closes = aggs.closes;
      const yesterdayCloses = closes.slice(0, -1);

      const todayShort     = calcSMA(closes,           SHORT_MA);
      const todayLong      = calcSMA(closes,           LONG_MA);
      const yesterdayShort = calcSMA(yesterdayCloses,  SHORT_MA);
      const yesterdayLong  = calcSMA(yesterdayCloses,  LONG_MA);

      // Bullish crossover: yesterday short <= long, today short > long
      if (yesterdayShort <= yesterdayLong && todayShort > todayLong) {
        const snap = snapshots.get(symbol);
        hits.push({
          symbol,
          price:      snap?.price ?? closes[closes.length - 1],
          change_pct: snap?.changesPercentage ?? null,
          volume:     snap?.volume ?? null,
          short_ma:   parseFloat(todayShort.toFixed(2)),
          long_ma:    parseFloat(todayLong.toFixed(2)),
        });
      }
    }));
    if (i + BATCH_SIZE < symbols.length) await sleep(POLY_DELAY_MS);
  }
  return hits;
}

// ── Confluence orchestration ─────────────────────────────────────────────────

interface ConfluenceEntry {
  signals: Set<string>;
  // Snapshot-derived fields, all optional — populated from whichever base
  // scan(s) hit for this ticker.
  price?: number | null;
  change_pct?: number | null;
  current_volume?: number | null;
  avg_volume?: number | null;
  volume_ratio?: number | null;
  high_52w?: number | null;
  pct_from_high?: number | null;
  open_price?: number | null;
  prev_close?: number | null;
  gap_pct?: number | null;
  short_ma?: number | null;
  long_ma?: number | null;
  // Indicators (filled in step 3)
  rsi?: number | null;
  adx?: ADXData | null;
  vwap?: number | null;
}

interface ConfluenceResult {
  ticker: string;
  score: number;
  tier: 'S' | 'A' | 'B' | null;
  signals: string[];
  rsi: number | null;
  adx: ADXData | null;
  vwap: number | null;
  entry: ConfluenceEntry;
}

async function runConfluenceScan(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
): Promise<{ scored: ConfluenceResult[]; insertedTickers: string[]; errors: Record<string, string> }> {
  const errors: Record<string, string> = {};

  // ── Step 0: pull snapshots once for the whole universe ───
  // All four base scans share this snapshot map so we don't re-fetch.
  const snapshots = await fetchPolygonSnapshots(TICKERS, apiKey);
  console.log(`[confluence] Snapshots: ${snapshots.size}/${TICKERS.length} tickers`);

  // ── Step 1: run base scans in parallel ───
  const [hits52w, hitsVol, hitsGap, hitsMA] = await Promise.all([
    scan52WeekHigh(snapshots, apiKey).catch((e) => {
      errors['scan_52w'] = (e as Error).message;
      return [] as Hit52w[];
    }),
    scanVolSurge(snapshots, apiKey).catch((e) => {
      errors['scan_vol_surge'] = (e as Error).message;
      return [] as HitVolSurge[];
    }),
    Promise.resolve(scanGapUp(snapshots)),
    scanMACross(snapshots, apiKey).catch((e) => {
      errors['scan_ma_cross'] = (e as Error).message;
      return [] as HitMACross[];
    }),
  ]);
  console.log(`[confluence] Base hits — 52w:${hits52w.length} vol:${hitsVol.length} gap:${hitsGap.length} ma:${hitsMA.length}`);

  // ── Step 2: merge hits by ticker into a Map ───
  const tickerMap = new Map<string, ConfluenceEntry>();
  const ensure = (sym: string): ConfluenceEntry => {
    if (!tickerMap.has(sym)) tickerMap.set(sym, { signals: new Set<string>() });
    return tickerMap.get(sym)!;
  };

  for (const h of hits52w) {
    const e = ensure(h.symbol);
    e.signals.add('52w_high');
    if (e.price == null)         e.price = h.price;
    if (e.change_pct == null)    e.change_pct = h.change_pct;
    if (e.current_volume == null) e.current_volume = h.volume;
    if (e.avg_volume == null)    e.avg_volume = h.avg_volume;
    e.high_52w = h.high_52w;
    e.pct_from_high = h.pct_from_high;
  }
  for (const h of hitsVol) {
    const e = ensure(h.symbol);
    e.signals.add('vol_surge');
    if (e.price == null)      e.price = h.price;
    if (e.change_pct == null) e.change_pct = h.change_pct;
    e.current_volume = h.current_volume;
    e.avg_volume = h.avg_volume;
    e.volume_ratio = h.volume_ratio;
  }
  for (const h of hitsGap) {
    const e = ensure(h.symbol);
    e.signals.add('gap_up');
    if (e.price == null)         e.price = h.price;
    if (e.change_pct == null)    e.change_pct = h.change_pct;
    if (e.current_volume == null) e.current_volume = h.volume;
    e.open_price = h.open_price;
    e.prev_close = h.prev_close;
    e.gap_pct = h.gap_pct;
  }
  for (const h of hitsMA) {
    const e = ensure(h.symbol);
    e.signals.add('ma_cross');
    if (e.price == null)         e.price = h.price;
    if (e.change_pct == null)    e.change_pct = h.change_pct;
    if (e.current_volume == null) e.current_volume = h.volume;
    e.short_ma = h.short_ma;
    e.long_ma = h.long_ma;
  }

  const survivors = [...tickerMap.keys()];
  console.log(`[confluence] ${survivors.length} survivors after merge`);

  // ── Step 3: fetch RSI / ADX / VWAP for each survivor (batched 5, 300ms) ───
  for (let i = 0; i < survivors.length; i += BATCH_SIZE) {
    const batch = survivors.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (ticker) => {
      const entry = tickerMap.get(ticker)!;
      try {
        const aggs = await fetchPolygonAggs(ticker, 60, apiKey);
        if (aggs) {
          entry.rsi  = calcRSI(aggs.closes);
          entry.adx  = calcADX(aggs.highs, aggs.lows, aggs.closes);
          entry.vwap = aggs.vwaps?.[aggs.vwaps.length - 1] ?? null;
        }
        // Snapshot vwap as fallback (already in the snapshot map).
        if (entry.vwap == null) {
          entry.vwap = snapshots.get(ticker)?.vwap ?? null;
        }
      } catch (e) {
        errors[`indicators:${ticker}`] = (e as Error).message;
      }
    }));
    if (i + BATCH_SIZE < survivors.length) await sleep(POLY_DELAY_MS);
  }

  // ── Step 4: score each ticker on the spec-defined weights ───
  const scored: ConfluenceResult[] = [];
  for (const [ticker, entry] of tickerMap.entries()) {
    let score = 0;

    // Signal weights
    for (const sig of entry.signals) score += SIGNAL_WEIGHTS[sig] ?? 0;

    // RSI: [50,70] +10 / [40,50) +3 / >70 -5
    const rsi = entry.rsi;
    if (rsi != null) {
      if      (rsi >= 50 && rsi <= 70) score += 10;
      else if (rsi >= 40 && rsi < 50)  score += 3;
      else if (rsi > 70)               score -= 5;
    }

    // ADX: ≥25 bullish +10 (+3 more if ≥40) / ≥25 bearish +2 / <20 -5
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

    // VWAP: price > vwap +7 / price < vwap -3
    const price = entry.price;
    const vwap  = entry.vwap;
    if (price != null && vwap != null && vwap > 0) {
      if (price > vwap) score += 7;
      else              score -= 3;
    }

    // Tier mapping per spec — drop below 55.
    let tier: 'S' | 'A' | 'B' | null = null;
    if      (score >= TIER_S_FLOOR) tier = 'S';
    else if (score >= TIER_A_FLOOR) tier = 'A';
    else if (score >= TIER_B_FLOOR) tier = 'B';

    scored.push({
      ticker,
      score,
      tier,
      signals: [...entry.signals],
      rsi,
      adx: adxData ?? null,
      vwap: vwap ?? null,
      entry,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Skip tickers already alerted today as confluence so we don't double-insert.
  const alertedToday = await getAlertedTodaySet(supabase, 'confluence');

  // ── Step 5: insert qualifying rows. Each insert is its own statement so
  //           one row's RLS / constraint failure can't mask the others. ───
  const insertedTickers: string[] = [];
  const nowIso = new Date().toISOString();

  for (const r of scored) {
    if (r.tier == null) continue; // dropped — score < 55
    if (alertedToday.has(r.ticker)) continue; // already filed today

    const sd = r.entry;
    const adxStr  = r.adx ? r.adx.adx.toFixed(2) : 'n/a';
    const rsiStr  = r.rsi != null ? r.rsi.toFixed(2) : 'n/a';
    const vwapStr = r.vwap != null ? r.vwap.toFixed(2) : 'n/a';
    const notes = `Tier ${r.tier} · Score ${r.score} · RSI ${rsiStr} · ADX ${adxStr} · VWAP ${vwapStr} · ${r.signals.join(' + ')}`;

    const row = {
      signal_type:       'confluence',
      ticker:            r.ticker,
      price:             sd.price ?? null,
      change_pct:        sd.change_pct ?? null,
      volume_ratio:      sd.volume_ratio ?? null,
      confluence_score:  r.score,
      confluence_tier:   r.tier,
      component_signals: r.signals,
      notes,
      created_at:        nowIso,
    };

    const { error: dbErr } = await supabase.from('breakout_alerts').insert(row);
    if (dbErr) {
      errors[r.ticker] = `DB insert failed: ${dbErr.message}`;
    } else {
      insertedTickers.push(r.ticker);
    }
  }

  return { scored, insertedTickers, errors };
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const url   = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';

    if (!force && !isMarketHours()) {
      console.log('[confluence] Outside market hours — skipping');
      return json({ skipped: true, reason: 'outside market hours' });
    }

    // Validate every required env var up front so a missing secret returns
    // a clear 500 with the offending key name instead of a downstream
    // Supabase / Polygon error that's harder to diagnose. Same pattern as
    // fetch-flow-data's UW_API_KEY check, extended to all three keys.
    const polygonKey      = Deno.env.get('POLYGON_API_KEY');
    const supabaseUrl     = Deno.env.get('SUPABASE_URL');
    const supabaseSrvRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!polygonKey)      throw new Error('Missing env var: POLYGON_API_KEY');
    if (!supabaseUrl)     throw new Error('Missing env var: SUPABASE_URL');
    if (!supabaseSrvRole) throw new Error('Missing env var: SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(supabaseUrl, supabaseSrvRole);

    console.log(`[confluence] Scanning ${TICKERS.length} tickers`);
    const { scored, insertedTickers, errors } = await runConfluenceScan(supabase, polygonKey);

    const summary = {
      ok: Object.keys(errors).length === 0,
      results: {
        scanned:  TICKERS.length,
        scored:   scored.length,
        inserted: insertedTickers,
        s_count:  scored.filter((r) => r.tier === 'S').length,
        a_count:  scored.filter((r) => r.tier === 'A').length,
        b_count:  scored.filter((r) => r.tier === 'B').length,
      },
      errors,
    };
    console.log('[confluence] Complete:', JSON.stringify(summary));
    return json(summary);

  } catch (err: any) {
    console.error('[confluence] Fatal:', err.message);
    return json({ error: err.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
