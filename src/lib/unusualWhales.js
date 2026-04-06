/**
 * Unusual Whales API Service
 * Provides options flow alerts and dark pool trades for UpTikAlerts.
 *
 * API: https://api.unusualwhales.com/api/...
 * Auth: Bearer token via VITE_UNUSUAL_WHALES_API_KEY
 * All endpoints are GET-only.
 *
 * Confirmed endpoints & field names (Apr 2026):
 *
 * Flow Alerts: GET /option-trades/flow-alerts?limit=N
 *   → { data: [{ ticker, strike, expiry, type ("call"/"put"), alert_rule,
 *        total_premium, total_size, volume, open_interest, underlying_price,
 *        volume_oi_ratio, iv_start, iv_end, bid, ask, created_at, ... }] }
 *
 * Dark Pool:  GET /darkpool/{TICKER}?limit=N
 *   → { data: [{ ticker, size, price, volume, executed_at, premium,
 *        nbbo_bid, nbbo_ask, nbbo_bid_quantity, nbbo_ask_quantity,
 *        market_center, canceled, ... }] }
 */

const UW_BASE = 'https://api.unusualwhales.com/api';
const API_KEY = import.meta.env.VITE_UNUSUAL_WHALES_API_KEY;

// Key tickers to fetch dark pool data for
const DP_TICKERS = ['TSLA', 'NVDA', 'AAPL', 'AMZN', 'META', 'MSFT', 'GOOGL', 'AMD', 'PLTR', 'SPY'];

// ─── helpers ──────────────────────────────────────────────────
function headers() {
  return { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' };
}

async function uwFetch(path, params = {}) {
  if (!API_KEY) {
    console.warn('[UW] No VITE_UNUSUAL_WHALES_API_KEY set');
    return null;
  }
  const url = new URL(`${UW_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, v);
  });
  try {
    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) {
      if (res.status !== 404) console.error(`[UW] ${res.status} — ${path}`);
      if (res.status === 401) console.error('[UW] Check your API key');
      if (res.status === 402) console.error('[UW] Plan limit — upgrade needed');
      if (res.status === 429) console.error('[UW] Rate limited');
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[UW] fetch error ${path}:`, err.message);
    return null;
  }
}

// ─── cache layer (1 min TTL) ─────────────────────────────────
const _cache = {};
const CACHE_TTL = 60_000;

function cached(key, fetcher) {
  return async function (...args) {
    const cacheKey = key + JSON.stringify(args);
    const entry = _cache[cacheKey];
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
    const data = await fetcher(...args);
    if (data != null) _cache[cacheKey] = { data, ts: Date.now() };
    return data ?? entry?.data ?? null;
  };
}

// ─── format helpers ──────────────────────────────────────────
function fmtDollars(n) {
  if (n == null) return null;
  const num = Number(n);
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function fmtShares(n) {
  if (n == null) return null;
  const num = Number(n);
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(0)}K`;
  return num.toLocaleString();
}

// Friendly alert rule names
const RULE_LABELS = {
  RepeatedHitsAscendingFill: 'Repeated Hits',
  Sweep: 'Sweep',
  GoldenSweep: 'Golden Sweep',
  Block: 'Block Trade',
  SplitStrike: 'Split Strike',
  FloorTrade: 'Floor Trade',
  MultiLeg: 'Multi-Leg',
};

// ─── Flow Alerts (options unusual activity) ──────────────────
async function _fetchFlowAlerts({ limit = 20 } = {}) {
  return await uwFetch('/option-trades/flow-alerts', { limit });
}
export const fetchFlowAlerts = cached('flowAlerts', _fetchFlowAlerts);

// ─── Dark Pool per-ticker ────────────────────────────────────
async function _fetchDarkpool(ticker, limit = 5) {
  return await uwFetch(`/darkpool/${ticker}`, { limit });
}
export const fetchDarkpool = cached('darkpool', _fetchDarkpool);

// ─── Normalize: Flow Alert → Smart Bet card ──────────────────
export function normalizeFlowAlert(raw, idx) {
  const ticker = raw.ticker || '???';
  const premium = Number(raw.total_premium || 0);
  const strike = raw.strike ? Number(raw.strike) : null;
  const expiry = raw.expiry || null;
  const optionType = raw.type || ''; // "call" or "put"
  const vol = raw.volume;
  const oi = raw.open_interest;
  const alertRule = raw.alert_rule || '';
  const ruleLabel = RULE_LABELS[alertRule] || alertRule.replace(/([A-Z])/g, ' $1').trim();
  const createdAt = raw.created_at || raw.end_time;

  const direction = optionType.toLowerCase().includes('put') ? 'down' : 'up';
  const betDesc = strike && expiry
    ? `${direction === 'up' ? 'Above' : 'Below'} $${strike} by ${expiry}`
    : ruleLabel || 'Options flow detected';

  // Determine conviction level based on premium
  let odds = 'Small bet';
  if (premium > 10_000_000) odds = 'High conviction';
  else if (premium > 1_000_000) odds = 'Moderate risk';
  else if (premium > 100_000) odds = 'Notable';

  const time = createdAt
    ? (typeof createdAt === 'number' ? new Date(createdAt) : new Date(createdAt))
    : new Date();

  return {
    id: `uw-sb-${idx}`,
    ticker,
    company: ticker, // UW doesn't return company name in flow alerts
    direction,
    bet: betDesc,
    amount: fmtDollars(premium),
    rawSize: premium,
    odds,
    unusual: raw.has_sweep || raw.volume_oi_ratio > 2 || true,
    time,
    detail: `${ruleLabel}: ${fmtDollars(premium)} in ${ticker} $${strike || '?'} ${optionType} ${expiry || ''}`.trim(),
    premium: strike ? `$${strike.toFixed(2)}` : null,
    volume: vol ? fmtShares(vol) : null,
    openInterest: oi ? fmtShares(oi) : null,
    uncertainty: premium > 5_000_000 ? 'High' : premium > 500_000 ? 'Moderate' : 'Low',
    _raw: raw,
  };
}

// ─── Normalize: Dark Pool Trade → Big Money card ─────────────
export function normalizeDarkpoolTrade(raw, idx) {
  const ticker = raw.ticker || '???';
  const price = Number(raw.price || 0);
  const size = Number(raw.size || 0);
  const dollar = price * size;
  const executedAt = raw.executed_at;
  const nbboBid = Number(raw.nbbo_bid || 0);
  const nbboAsk = Number(raw.nbbo_ask || 0);

  // Direction heuristic: compare trade price to midpoint of NBBO
  let direction = 'neutral';
  if (nbboBid > 0 && nbboAsk > 0) {
    const mid = (nbboBid + nbboAsk) / 2;
    if (price >= mid + 0.005) direction = 'buying';      // at or above mid → likely buyer-initiated
    else if (price <= mid - 0.005) direction = 'selling'; // below mid → likely seller-initiated
  }

  return {
    id: `uw-bm-${idx}`,
    ticker,
    company: ticker,
    price,
    shares: fmtShares(size),
    dollarValue: fmtDollars(dollar),
    rawDollar: dollar,
    direction,
    time: executedAt ? new Date(executedAt) : new Date(),
    multiplier: null, // no avg size in dark pool endpoint
    note: `Dark pool: ${fmtShares(size)} shares at $${price.toFixed(2)} (${fmtDollars(dollar)}) — NBBO $${nbboBid.toFixed(2)}/$${nbboAsk.toFixed(2)}`,
    _raw: raw,
  };
}

// ─── High-level fetchers for AlertsTab ───────────────────────

/**
 * Fetch and normalize Smart Bets data (options flow alerts).
 * Returns array in the same shape as mockSmartBets.
 */
export async function getSmartBets({ limit = 10 } = {}) {
  const raw = await fetchFlowAlerts({ limit });
  if (!raw?.data || !Array.isArray(raw.data)) return null;
  const items = raw.data.filter(d => !d.canceled);
  console.log(`[UW] Got ${items.length} flow alerts`);
  return items.map((item, i) => normalizeFlowAlert(item, i));
}

/**
 * Fetch and normalize Big Money data (dark pool trades).
 * Fetches top trades for key tickers, then merges & sorts by dollar value.
 * Returns array in the same shape as mockBigMoney.
 */
export async function getBigMoney({ limit = 10 } = {}) {
  // Fetch dark pool trades for top tickers with staggered requests to avoid 429
  const results = [];
  const BATCH = 3; // 3 concurrent requests at a time
  for (let i = 0; i < DP_TICKERS.length; i += BATCH) {
    const batch = DP_TICKERS.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(t => fetchDarkpool(t, 3)));
    results.push(...batchResults);
    // Small delay between batches to respect rate limits
    if (i + BATCH < DP_TICKERS.length) await new Promise(r => setTimeout(r, 300));
  }

  // Flatten, filter out canceled, sort by dollar value
  const allTrades = [];
  results.forEach(res => {
    if (res?.data && Array.isArray(res.data)) {
      res.data.forEach(trade => {
        if (!trade.canceled) allTrades.push(trade);
      });
    }
  });

  if (allTrades.length === 0) {
    console.warn('[UW] No dark pool trades found');
    return null;
  }

  // Sort by premium (dollar value) descending, take top N
  allTrades.sort((a, b) => Number(b.premium || 0) - Number(a.premium || 0));
  const top = allTrades.slice(0, limit);

  console.log(`[UW] Got ${allTrades.length} dark pool trades, showing top ${top.length}`);
  return top.map((item, i) => normalizeDarkpoolTrade(item, i));
}

/**
 * Quick connectivity test
 */
export async function testConnection() {
  const res = await uwFetch('/option-trades/flow-alerts', { limit: 1 });
  if (res?.data) {
    console.log('[UW] Connection OK ✓');
    return true;
  }
  console.error('[UW] Connection FAILED');
  return false;
}

export function clearCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}
