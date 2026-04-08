// ============================================
// UPTIKALERTS — institutionalFlow.js
// Client-side Unusual Whales flow scanner.
// Fetches options flow + dark pool directly from UW API,
// scores tickers, and inserts top alerts into breakout_alerts.
// ============================================

import { supabase } from './supabase';

const UW_KEY  = import.meta.env.VITE_UW_API_KEY;
const UW_BASE = 'https://api.unusualwhales.com';
const TOP_N   = 4;
const MIN_MARKET_CAP_B = 3;

// ── Excluded tickers (ETFs, indexes, leveraged) ────────────────────────────
const EXCLUDED = new Set([
  'SPY','QQQ','IWM','DIA','VTI','VOO','SPX','SPXW','NDX',
  'XLF','XLE','XLK','XLV','XLI','XLU','XLP','XLY','XLB','XLRE',
  'GLD','SLV','USO','TLT','HYG','LQD','EEM','EFA','VXX',
  'SOXL','SOXS','TQQQ','SQQQ','UVXY','SVXY','ARKK',
  'SMH','KWEB','FXI','BITO','IBIT','GDX','GDXJ',
  'VIX','RUT','OEX','XSP',
  'SPYM','SPMD','SPLG','SPDW','SPEM','SPTM','SPTL','SPAB','SPSM',
  'DFUS','DFAS','DFAI','DFAC','DFAT','DFIV','DFAE','DFAU',
  'RSP','SCHD','JEPI','JEPQ','DIVO','VIG','VUG','VTV','VGT',
  'VXUS','VEA','VWO','BND','VCIT','AGG','IEF','SHY','TIP',
  'XBI','IBB','HACK','BOTZ','ROBO','DRIV','LIT','TAN','ICLN',
  'JETS','PBW','ARKG','ARKW','ARKF','ARKQ',
]);

// ── Mega-cap penalty (score × 0.3) ─────────────────────────────────────────
const PENALIZED = new Set([
  'AAPL','MSFT','GOOGL','GOOG','AMZN','NVDA','META','TSLA',
  'BRK.A','BRK.B','BRKB','JPM','V','MA','JNJ','WMT','PG',
  'XOM','UNH','HD','BAC','KO','PEP','COST','MRK','ABBV',
  'CVX','CRM','AVGO','LLY','NFLX','AMD','ADBE','ORCL',
  'CSCO','ACN','INTC','CMCSA','T','VZ','DIS','NKE',
  'MCD','IBM','GE','CAT','BA','GS','MS','C',
  'PYPL','UBER','SQ','SHOP','SNOW','PLTR','COIN',
]);

const SECTOR_TIER_BONUS = { 1: 15, 2: 10, 3: 5 };

// ══════════════════════════════════════════════════════════════════════════════
// UW API HELPERS
// ══════════════════════════════════════════════════════════════════════════════

async function uwGet(path) {
  const res = await fetch(`${UW_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${UW_KEY}`, 'Accept': 'application/json' },
  });
  if (res.status === 429) throw new Error('UW rate limit — try again shortly');
  if (res.status === 401 || res.status === 403) throw new Error(`UW auth error (${res.status}) — check API key`);
  if (!res.ok) throw new Error(`UW HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// PARSERS
// ══════════════════════════════════════════════════════════════════════════════

function classifyDirection(t) {
  const sent = (t.sentiment || t.bullish_or_bearish || t.direction || '').toLowerCase();
  if (sent.includes('bullish') || sent === 'above_ask') return 'bullish';
  if (sent.includes('bearish') || sent === 'below_bid') return 'bearish';
  const optType = (t.put_call || t.option_type || '').toLowerCase();
  const side = (t.side || t.aggressor || '').toLowerCase();
  if (optType === 'call' && side.includes('buy')) return 'bullish';
  if (optType === 'put' && side.includes('buy')) return 'bearish';
  if (optType === 'call' && side.includes('sell')) return 'bearish';
  if (optType === 'put' && side.includes('sell')) return 'bullish';
  return 'neutral';
}

function parseOptionsFlow(raw) {
  return raw.map(t => {
    const direction = classifyDirection(t);
    const strike = parseFloat(t.strike_price || t.strike) || null;
    const expiry = t.expires_at || t.expiration_date || null;
    const optionType = (t.put_call || t.option_type || '').toLowerCase() || null;
    const premium = parseFloat(t.total_premium || t.premium || t.cost_basis) || null;
    const size = parseInt(t.total_size || t.size || t.volume) || null;
    const underlyingPrice = parseFloat(t.underlying_price || t.stock_price) || null;

    let betDesc = null;
    if (strike && expiry && optionType) {
      const verb = optionType === 'call' ? 'Above' : 'Below';
      const expiryShort = new Date(expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      betDesc = `${verb} $${strike} by ${expiryShort}`;
    }

    let isOtm = false;
    if (strike && underlyingPrice && optionType) {
      isOtm = optionType === 'call' ? strike > underlyingPrice : strike < underlyingPrice;
    }

    return {
      uw_id: t.id || t.trade_id || null,
      ticker: (t.ticker || t.symbol || '').toUpperCase(),
      company: t.company_name || t.name || null,
      direction,
      trade_type: (t.option_activity_type || t.trade_type || t.type || '').toLowerCase() || null,
      sentiment: (t.sentiment || t.aggressor || '').toLowerCase() || null,
      strike, expiry, option_type: optionType, premium, size,
      open_interest: parseInt(t.open_interest) || null,
      volume: parseInt(t.volume || t.option_volume) || null,
      underlying_price: underlyingPrice,
      is_unusual: !!(t.is_unusual || t.unusual),
      is_otm: isOtm,
      bet_desc: betDesc,
      executed_at: t.executed_at || t.created_at || t.date || new Date().toISOString(),
    };
  }).filter(r => r.ticker.length > 0);
}

function parseDarkpool(raw) {
  return raw.map(t => {
    const price = parseFloat(t.price || t.avg_price || t.trade_price) || 0;
    const shares = parseInt(t.shares || t.size || t.volume) || 0;
    const dollarValue = price && shares ? price * shares : parseFloat(t.notional || t.dollar_value) || null;
    const multiplier = parseFloat(t.volume_multiplier || t.size_multiplier) || null;

    let note = null;
    if (dollarValue && dollarValue >= 1_000_000) {
      const millions = (dollarValue / 1_000_000).toFixed(1);
      note = `$${millions}M dark pool print`;
      if (multiplier && multiplier > 1) note += ` (${multiplier.toFixed(1)}x normal size)`;
    }

    return {
      uw_id: t.id || t.trade_id || null,
      ticker: (t.ticker || t.symbol || '').toUpperCase(),
      company: t.company_name || t.name || null,
      price, shares, dollar_value: dollarValue,
      direction: (t.trade_direction || t.direction || 'neutral').toLowerCase(),
      multiplier,
      venue: t.venue || t.market_center || t.exchange || null,
      note,
      executed_at: t.executed_at || t.created_at || t.date || new Date().toISOString(),
    };
  }).filter(r => r.ticker.length > 0 && r.price > 0 && r.shares > 0);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTOR + CONVICTION LOADERS (from Supabase)
// ══════════════════════════════════════════════════════════════════════════════

async function loadSectorMap() {
  const { data, error } = await supabase
    .from('ticker_sectors')
    .select('ticker, company, sector, sector_tier, market_cap_b');
  if (error) { console.warn('[Flow] Failed to load sectors:', error.message); return new Map(); }
  const map = new Map();
  for (const row of (data || [])) map.set(row.ticker, row);
  console.log(`[Flow] Loaded ${map.size} sector mappings`);
  return map;
}

async function loadConvictionMap() {
  const { data, error } = await supabase
    .from('v_multi_day_conviction')
    .select('ticker, activity_type, active_days, total_trades');
  if (error) { console.warn('[Flow] Failed to load conviction:', error.message); return new Map(); }
  const map = new Map();
  for (const row of (data || [])) {
    if (!map.has(row.ticker)) map.set(row.ticker, []);
    map.get(row.ticker).push(row);
  }
  console.log(`[Flow] Loaded ${map.size} conviction tickers`);
  return map;
}

// ══════════════════════════════════════════════════════════════════════════════
// SCORING ENGINE
// ══════════════════════════════════════════════════════════════════════════════

function scoreAndRank(options, darkpool, sectorMap, convictionMap) {
  const tickerMap = new Map();

  const getOrCreate = (ticker, company) => {
    if (!tickerMap.has(ticker)) {
      const si = sectorMap.get(ticker);
      tickerMap.set(ticker, {
        ticker, company: company || si?.company || null, score: 0,
        totalPremium: 0, totalDarkpoolValue: 0,
        bullishCallSweeps: 0, tradeCount: 0, optionsCount: 0, darkpoolCount: 0,
        topBet: null, topBetAmount: 0, underlyingPrice: null,
        direction: 'neutral', signals: [],
        sector: si?.sector || null, sectorTier: si?.sector_tier || null,
        marketCapB: si?.market_cap_b || null,
        conviction: 'standard', convictionDays: 0,
        hasOptionsFlow: false, hasDarkpool: false,
      });
    }
    return tickerMap.get(ticker);
  };

  // Score options flow
  for (const o of options) {
    const ts = getOrCreate(o.ticker, o.company);
    ts.tradeCount++; ts.optionsCount++; ts.hasOptionsFlow = true;

    if (o.premium) {
      ts.totalPremium += o.premium;
      if (o.premium > ts.topBetAmount) { ts.topBetAmount = o.premium; ts.topBet = o.bet_desc; }
    }

    const isSweep = (o.trade_type || '').includes('sweep');
    const isCall = o.option_type === 'call';
    const isBullish = o.direction === 'bullish';

    if (isBullish && isCall && isSweep) { ts.bullishCallSweeps++; ts.score += 25; }
    else if (isBullish && isCall) ts.score += 15;
    else if (isBullish) ts.score += 8;
    else if (o.direction === 'bearish') ts.score -= 5;

    if (o.is_unusual) ts.score += 10;
    if (o.premium && o.premium >= 1_000_000) ts.score += 20;
    else if (o.premium && o.premium >= 500_000) ts.score += 12;
    else if (o.premium && o.premium >= 100_000) ts.score += 5;

    if (o.underlying_price) ts.underlyingPrice = o.underlying_price;
  }

  // Score dark pool
  for (const d of darkpool) {
    const ts = getOrCreate(d.ticker, d.company);
    ts.tradeCount++; ts.darkpoolCount++; ts.hasDarkpool = true;

    if (d.dollar_value) {
      ts.totalDarkpoolValue += d.dollar_value;
      if (d.dollar_value >= 10_000_000) ts.score += 20;
      else if (d.dollar_value >= 1_000_000) ts.score += 10;
      else if (d.dollar_value >= 500_000) ts.score += 5;
    }

    if (d.direction === 'buying') ts.score += 8;
    else if (d.direction === 'selling') ts.score -= 3;

    if (d.multiplier && d.multiplier >= 5) ts.score += 15;
    else if (d.multiplier && d.multiplier >= 2) ts.score += 8;

    if (!ts.underlyingPrice && d.price) ts.underlyingPrice = d.price;
  }

  // Finalize scores
  for (const [, ts] of tickerMap) {
    if (ts.totalPremium > 0) ts.score += Math.min(30, Math.round(Math.log10(ts.totalPremium) * 5));
    if (ts.totalDarkpoolValue > 0) ts.score += Math.min(20, Math.round(Math.log10(ts.totalDarkpoolValue) * 3));
    if (ts.tradeCount >= 5) ts.score += 10;
    else if (ts.tradeCount >= 3) ts.score += 5;

    // Sector tier bonus
    if (ts.sectorTier && SECTOR_TIER_BONUS[ts.sectorTier]) {
      const bonus = SECTOR_TIER_BONUS[ts.sectorTier];
      ts.score += bonus;
      ts.signals.push(`🏷️ Sector bonus +${bonus} (Tier ${ts.sectorTier})`);
    }

    // Multi-day conviction
    const convictions = convictionMap.get(ts.ticker);
    if (convictions && convictions.length > 0) {
      let maxDays = 0;
      for (const c of convictions) { if (c.active_days > maxDays) maxDays = c.active_days; }
      ts.convictionDays = maxDays;
      if (maxDays >= 4) { ts.conviction = 'very_high'; ts.score = Math.round(ts.score * 2.5); ts.signals.push(`🔥 Very high conviction: ${maxDays} days`); }
      else if (maxDays >= 3) { ts.conviction = 'high'; ts.score = Math.round(ts.score * 2.0); ts.signals.push(`🔥 High conviction: ${maxDays} days`); }
    }

    // Cross-signal convergence
    if (ts.hasOptionsFlow && ts.hasDarkpool) {
      ts.score += 20;
      ts.signals.push('🎯 Cross-signal: options + dark pool converging');
    }

    // Direction
    ts.direction = (ts.bullishCallSweeps > 0 || ts.score > 20) ? 'bullish' : ts.score < -10 ? 'bearish' : 'neutral';

    // Signal descriptions
    if (ts.bullishCallSweeps > 0) ts.signals.push(`${ts.bullishCallSweeps} bullish call sweep${ts.bullishCallSweeps > 1 ? 's' : ''}`);
    if (ts.totalPremium >= 1_000_000) ts.signals.push(`$${(ts.totalPremium / 1e6).toFixed(1)}M options premium`);
    if (ts.totalDarkpoolValue >= 1_000_000) ts.signals.push(`$${(ts.totalDarkpoolValue / 1e6).toFixed(1)}M dark pool`);
    if (ts.topBet) ts.signals.push(`Top bet: ${ts.topBet} ($${(ts.topBetAmount / 1e6).toFixed(1)}M)`);

    // Mega-cap penalty
    if (PENALIZED.has(ts.ticker)) ts.score = Math.round(ts.score * 0.3);
  }

  const all = Array.from(tickerMap.values());
  console.log(`[Flow] Scoring: ${all.length} unique tickers in tickerMap`);
  if (all.length > 0) {
    // Debug: show top 10 before filtering
    const sorted = [...all].sort((a, b) => b.score - a.score).slice(0, 10);
    console.log('[Flow] Top 10 before filter:', sorted.map(t =>
      `${t.ticker}(score=${t.score}, opts=${t.optionsCount}, dp=${t.darkpoolCount}, excluded=${EXCLUDED.has(t.ticker)}, mcap=${t.marketCapB})`
    ).join(', '));
  }

  return all
    .filter(ts => {
      if (ts.score <= 0) { console.log(`[Flow] FILTER OUT ${ts.ticker}: score=${ts.score} <= 0`); return false; }
      if (EXCLUDED.has(ts.ticker)) { console.log(`[Flow] FILTER OUT ${ts.ticker}: excluded`); return false; }
      // Require options flow OR significant dark pool activity
      if (ts.optionsCount < 1 && ts.darkpoolCount < 1) { console.log(`[Flow] FILTER OUT ${ts.ticker}: opts=${ts.optionsCount}, dp=${ts.darkpoolCount}`); return false; }
      if (ts.marketCapB !== null && ts.marketCapB < MIN_MARKET_CAP_B) { console.log(`[Flow] FILTER OUT ${ts.ticker}: mcap=${ts.marketCapB} < ${MIN_MARKET_CAP_B}`); return false; }
      console.log(`[Flow] PASS ${ts.ticker}: score=${ts.score}, opts=${ts.optionsCount}, dp=${ts.darkpoolCount}`);
      return true;
    })
    .sort((a, b) => b.score - a.score);
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — called by ProfileTab handleFlowScan
// ══════════════════════════════════════════════════════════════════════════════

export async function runFlowScan() {
  if (!UW_KEY) throw new Error('Missing VITE_UW_API_KEY in .env');

  console.log('[Flow] Starting Unusual Whales scan…');

  // Load sector + conviction data in parallel
  const [sectorMap, convictionMap] = await Promise.all([
    loadSectorMap(),
    loadConvictionMap(),
  ]);

  let allOptions = [];
  let allDarkpool = [];

  // ── 1. Fetch options flow ──
  try {
    console.log('[Flow] Fetching options flow…');
    const flowData = await uwGet('/api/option-trades/flow-alerts');
    const rawFlow = Array.isArray(flowData) ? flowData : (flowData.data || flowData.trades || []);
    console.log(`[Flow] Raw options: ${rawFlow.length} trades`);

    if (rawFlow.length > 0) {
      const parsed = parseOptionsFlow(rawFlow);
      const significant = parsed.filter(t => t.is_unusual || (t.premium && t.premium >= 50000));
      allOptions = significant.length > 0 ? significant : parsed.slice(0, 50);

      // Store in options_flow table
      if (allOptions.length > 0) {
        const { error } = await supabase
          .from('options_flow')
          .upsert(allOptions, { onConflict: 'uw_id', ignoreDuplicates: true });
        if (error) console.warn('[Flow] Options insert error:', error.message);
        else console.log(`[Flow] Stored ${allOptions.length} options trades`);
      }
    }
  } catch (e) {
    console.error('[Flow] Options flow error:', e.message);
    throw new Error(`Options flow: ${e.message}`);
  }

  // ── 2. Fetch dark pool ──
  try {
    console.log('[Flow] Fetching dark pool…');
    const dpData = await uwGet('/api/darkpool/recent');
    const rawDp = Array.isArray(dpData) ? dpData : (dpData.data || dpData.trades || []);
    console.log(`[Flow] Raw dark pool: ${rawDp.length} trades`);

    if (rawDp.length > 0) {
      const parsed = parseDarkpool(rawDp);
      const large = parsed.filter(t => (t.dollar_value && t.dollar_value >= 500000) || (t.multiplier && t.multiplier >= 2));
      allDarkpool = large.length > 0 ? large : parsed.slice(0, 50);

      if (allDarkpool.length > 0) {
        const { error } = await supabase
          .from('darkpool_trades')
          .upsert(allDarkpool, { onConflict: 'uw_id', ignoreDuplicates: true });
        if (error) console.warn('[Flow] Dark pool insert error:', error.message);
        else console.log(`[Flow] Stored ${allDarkpool.length} dark pool trades`);
      }
    }
  } catch (e) {
    console.error('[Flow] Dark pool error:', e.message);
    throw new Error(`Dark pool: ${e.message}`);
  }

  // ── 3. Upsert activity log ──
  try {
    const today = new Date().toISOString().split('T')[0];
    const rollups = {};

    for (const o of allOptions) {
      if (EXCLUDED.has(o.ticker)) continue;
      const key = `${o.ticker}:options:${today}`;
      if (!rollups[key]) rollups[key] = { ticker: o.ticker, activity_type: 'options', trading_date: today, trade_count: 0, total_premium: 0, total_dp_value: 0, net_direction: 'neutral' };
      rollups[key].trade_count++;
      if (o.premium) rollups[key].total_premium += o.premium;
      if (o.direction === 'bullish') rollups[key].net_direction = 'bullish';
    }
    for (const d of allDarkpool) {
      if (EXCLUDED.has(d.ticker)) continue;
      const key = `${d.ticker}:darkpool:${today}`;
      if (!rollups[key]) rollups[key] = { ticker: d.ticker, activity_type: 'darkpool', trading_date: today, trade_count: 0, total_premium: 0, total_dp_value: 0, net_direction: 'neutral' };
      rollups[key].trade_count++;
      if (d.dollar_value) rollups[key].total_dp_value += d.dollar_value;
      if (d.direction === 'buying') rollups[key].net_direction = 'bullish';
    }

    const rows = Object.values(rollups);
    if (rows.length > 0) {
      const { error } = await supabase
        .from('ticker_activity_log')
        .upsert(rows, { onConflict: 'ticker,activity_type,trading_date' });
      if (error) console.warn('[Flow] Activity log error:', error.message);
      else console.log(`[Flow] Upserted ${rows.length} activity log entries`);
    }
  } catch (e) {
    console.warn('[Flow] Activity log error:', e.message);
  }

  // ── 4. Score and generate alerts ──
  const ranked = scoreAndRank(allOptions, allDarkpool, sectorMap, convictionMap);
  const topTickers = ranked.slice(0, TOP_N);
  console.log(`[Flow] Scored ${ranked.length} tickers, top ${TOP_N}:`,
    topTickers.map(t => `${t.ticker}(${t.score},${t.conviction})`).join(', '));

  let inserted = 0;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  for (const ts of topTickers) {
    if (ts.score < 15) continue;

    // Dedup: check if already alerted today
    const { data: existing } = await supabase
      .from('breakout_alerts')
      .select('id')
      .eq('signal_type', 'flow_signal')
      .eq('ticker', ts.ticker)
      .gte('created_at', todayStart.toISOString())
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[Flow] ${ts.ticker}: already alerted today, skipping`);
      continue;
    }

    const signalText = ts.signals.slice(0, 4).join(' · ');
    const dirEmoji = ts.direction === 'bullish' ? '🟢' : ts.direction === 'bearish' ? '🔴' : '🟡';
    const convictionEmoji = ts.conviction === 'very_high' ? '🔥🔥' : ts.conviction === 'high' ? '🔥' : '';

    const alertRow = {
      signal_type: 'flow_signal',
      ticker: ts.ticker,
      notes: `${dirEmoji}${convictionEmoji} ${ts.ticker} Flow Signal · ${signalText}`,
      price: ts.underlyingPrice || 0,
      volume: ts.tradeCount,
      change_pct: 0,
      rel_volume: ts.score,
      avg_volume: ts.totalPremium,
      volume_ratio: ts.bullishCallSweeps,
      gap_pct: ts.totalDarkpoolValue,
      pct_from_high: ts.optionsCount,
      high_52w: ts.darkpoolCount,
      sector: ts.sector || null,
      conviction: ts.conviction,
      sector_tier: ts.sectorTier || null,
    };

    const { error } = await supabase.from('breakout_alerts').insert(alertRow);
    if (error) {
      console.error(`[Flow] ${ts.ticker} alert error:`, error.message);
    } else {
      inserted++;
      console.log(`[Flow] ${ts.ticker}: ALERT CREATED (score=${ts.score}, conviction=${ts.conviction})`);
    }
  }

  console.log(`[Flow] Done — ${inserted} flow alerts created`);
  return { inserted, scored: ranked.length, top: topTickers.map(t => t.ticker) };
}
