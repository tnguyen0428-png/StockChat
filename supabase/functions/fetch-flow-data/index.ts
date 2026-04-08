// ============================================
// UPTIKALERTS — fetch-flow-data Edge Function
// Fetches options flow + dark pool data from Unusual Whales
// Scores tickers with sector awareness, market cap filter,
// multi-day conviction tracking, and cross-signal convergence
// Runs every 30 min during market hours via pg_cron
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const UW_BASE = 'https://api.unusualwhales.com';
const TOP_N = 4; // Number of top tickers to generate alerts for
const MIN_MARKET_CAP_B = 3; // Minimum market cap in billions ($3B floor)

// ── Hard-excluded: ETFs & indexes (never alert) ─────────────────────────────
const EXCLUDED_TICKERS = new Set([
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
  // SPDR portfolio ETFs & Dimensional ETFs (caught in flow data)
  'SPYM', 'SPMD', 'SPLG', 'SPDW', 'SPEM', 'SPTM', 'SPTL', 'SPAB', 'SPSM',
  'DFUS', 'DFAS', 'DFAI', 'DFAC', 'DFAT', 'DFIV', 'DFAE', 'DFAU',
  // Additional broad / factor ETFs commonly in flow
  'RSP', 'SCHD', 'JEPI', 'JEPQ', 'DIVO', 'VIG', 'VUG', 'VTV', 'VGT',
  'VXUS', 'VEA', 'VWO', 'BND', 'VCIT', 'AGG', 'IEF', 'SHY', 'TIP',
  'XBI', 'IBB', 'HACK', 'BOTZ', 'ROBO', 'DRIV', 'LIT', 'TAN', 'ICLN',
  'JETS', 'PBW', 'ARKG', 'ARKW', 'ARKF', 'ARKQ',
]);

// ── Mega-cap penalty list (score * 0.3 so mid/small caps rank higher) ───────
const PENALIZED_TICKERS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA',
  'BRK.A', 'BRK.B', 'BRKB', 'JPM', 'V', 'MA', 'JNJ', 'WMT', 'PG',
  'XOM', 'UNH', 'HD', 'BAC', 'KO', 'PEP', 'COST', 'MRK', 'ABBV',
  'CVX', 'CRM', 'AVGO', 'LLY', 'NFLX', 'AMD', 'ADBE', 'ORCL',
  'CSCO', 'ACN', 'INTC', 'CMCSA', 'T', 'VZ', 'DIS', 'NKE',
  'MCD', 'IBM', 'GE', 'CAT', 'BA', 'GS', 'MS', 'C',
  'PYPL', 'UBER', 'SQ', 'SHOP', 'SNOW', 'PLTR', 'COIN',
]);

// ── Sector tier score bonuses ───────────────────────────────────────────────
const SECTOR_TIER_BONUS: Record<number, number> = {
  1: 15,  // Hottest sectors (AI Cooling, Nuclear, Memory/HBM, Grid Power)
  2: 10,  // Strong sectors (Photonics, Agentic AI, Defense AI)
  3: 5,   // Emerging sectors (Quantum, Robotics, Space, Biotech AI, Energy Storage)
};

// ── Market hours guard ───────────────────────────────────────────────────────

function isMarketHours(): boolean {
  const now = new Date();
  const dow = now.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  // Determine EST (-5) vs EDT (-4) using US DST rules:
  // DST starts 2nd Sunday of March, ends 1st Sunday of November
  const month = now.getUTCMonth(); // 0-indexed
  const isDST = (() => {
    if (month > 2 && month < 10) return true;   // Apr–Oct always EDT
    if (month < 2 || month > 10) return false;   // Jan–Feb, Dec always EST
    // March: DST starts 2nd Sunday
    if (month === 2) {
      const firstDay = new Date(Date.UTC(now.getUTCFullYear(), 2, 1)).getUTCDay();
      const secondSunday = firstDay === 0 ? 8 : 15 - firstDay;
      return now.getUTCDate() > secondSunday || (now.getUTCDate() === secondSunday && now.getUTCHours() >= 7);
    }
    // November: DST ends 1st Sunday
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), 10, 1)).getUTCDay();
    const firstSunday = firstDay === 0 ? 1 : 8 - firstDay;
    return now.getUTCDate() < firstSunday || (now.getUTCDate() === firstSunday && now.getUTCHours() < 6);
  })();
  const utcOffset = isDST ? 4 : 5;
  const etMinutes = (now.getUTCHours() - utcOffset) * 60 + now.getUTCMinutes();
  return etMinutes >= 9 * 60 && etMinutes < 16 * 60 + 30;
}

// ── Unusual Whales API helpers ───────────────────────────────────────────────

async function uwGet(path: string, apiKey: string): Promise<any> {
  const res = await fetch(`${UW_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    },
  });

  if (res.status === 429) throw new Error('UW rate limit — back off and retry next cycle');
  if (res.status === 401 || res.status === 403) throw new Error(`UW auth error (${res.status}) — check API key`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`UW HTTP ${res.status}: ${res.statusText} — ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Options flow processing ──────────────────────────────────────────────────

interface OptionsFlowRow {
  uw_id: string | null;
  ticker: string;
  company: string | null;
  direction: string;
  trade_type: string | null;
  sentiment: string | null;
  strike: number | null;
  expiry: string | null;
  option_type: string | null;
  premium: number | null;
  size: number | null;
  open_interest: number | null;
  volume: number | null;
  underlying_price: number | null;
  is_unusual: boolean;
  is_otm: boolean;
  bet_desc: string | null;
  executed_at: string;
}

function parseOptionsFlow(raw: any[]): OptionsFlowRow[] {
  return raw.map((t: any) => {
    const direction = classifyDirection(t);
    const strike = parseFloat(t.strike_price || t.strike) || null;
    const expiry = t.expires_at || t.expiration_date || null;
    const optionType = (t.put_call || t.option_type || '').toLowerCase() || null;
    const premium = parseFloat(t.total_premium || t.premium || t.cost_basis) || null;
    const size = parseInt(t.total_size || t.size || t.volume) || null;
    const underlyingPrice = parseFloat(t.underlying_price || t.stock_price) || null;

    let betDesc: string | null = null;
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
      strike,
      expiry,
      option_type: optionType,
      premium,
      size,
      open_interest: parseInt(t.open_interest) || null,
      volume: parseInt(t.volume || t.option_volume) || null,
      underlying_price: underlyingPrice,
      is_unusual: !!(t.is_unusual || t.unusual),
      is_otm: isOtm,
      bet_desc: betDesc,
      executed_at: t.executed_at || t.created_at || t.date || new Date().toISOString(),
    };
  }).filter((r: OptionsFlowRow) => r.ticker.length > 0);
}

function classifyDirection(t: any): string {
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

// ── Dark pool processing ─────────────────────────────────────────────────────

interface DarkpoolRow {
  uw_id: string | null;
  ticker: string;
  company: string | null;
  price: number;
  shares: number;
  dollar_value: number | null;
  direction: string;
  multiplier: number | null;
  venue: string | null;
  note: string | null;
  executed_at: string;
}

function parseDarkpool(raw: any[]): DarkpoolRow[] {
  return raw.map((t: any) => {
    const price = parseFloat(t.price || t.avg_price || t.trade_price) || 0;
    const shares = parseInt(t.shares || t.size || t.volume) || 0;
    const dollarValue = price && shares ? price * shares : parseFloat(t.notional || t.dollar_value) || null;
    const multiplier = parseFloat(t.volume_multiplier || t.size_multiplier) || null;

    let note: string | null = null;
    if (dollarValue && dollarValue >= 1_000_000) {
      const millions = (dollarValue / 1_000_000).toFixed(1);
      note = `$${millions}M dark pool print`;
      if (multiplier && multiplier > 1) note += ` (${multiplier.toFixed(1)}x normal size)`;
    }

    return {
      uw_id: t.id || t.trade_id || null,
      ticker: (t.ticker || t.symbol || '').toUpperCase(),
      company: t.company_name || t.name || null,
      price,
      shares,
      dollar_value: dollarValue,
      direction: (t.trade_direction || t.direction || 'neutral').toLowerCase(),
      multiplier,
      venue: t.venue || t.market_center || t.exchange || null,
      note,
      executed_at: t.executed_at || t.created_at || t.date || new Date().toISOString(),
    };
  }).filter((r: DarkpoolRow) => r.ticker.length > 0 && r.price > 0 && r.shares > 0);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTOR & CONVICTION DATA LOADERS
// ══════════════════════════════════════════════════════════════════════════════

interface SectorInfo {
  ticker: string;
  company: string | null;
  sector: string;
  sector_tier: number;
  market_cap_b: number | null;
}

interface ConvictionInfo {
  ticker: string;
  activity_type: string;
  active_days: number;
  total_trades: number;
}

async function loadSectorMap(supabase: any): Promise<Map<string, SectorInfo>> {
  const { data, error } = await supabase
    .from('ticker_sectors')
    .select('ticker, company, sector, sector_tier, market_cap_b');

  if (error) {
    console.error('[flow-data] Failed to load ticker_sectors:', error.message);
    return new Map();
  }

  const map = new Map<string, SectorInfo>();
  for (const row of (data || [])) {
    map.set(row.ticker, row);
  }
  console.log(`[flow-data] Loaded ${map.size} sector mappings`);
  return map;
}

async function loadConvictionMap(supabase: any): Promise<Map<string, ConvictionInfo[]>> {
  // Use v_multi_day_conviction view — returns tickers with 3+ active days in last 7 calendar days
  const { data, error } = await supabase
    .from('v_multi_day_conviction')
    .select('ticker, activity_type, active_days, total_trades');

  if (error) {
    console.error('[flow-data] Failed to load conviction data:', error.message);
    return new Map();
  }

  const map = new Map<string, ConvictionInfo[]>();
  for (const row of (data || [])) {
    if (!map.has(row.ticker)) map.set(row.ticker, []);
    map.get(row.ticker)!.push(row);
  }
  console.log(`[flow-data] Loaded ${map.size} multi-day conviction tickers`);
  return map;
}

async function upsertActivityLog(
  supabase: any,
  options: OptionsFlowRow[],
  darkpool: DarkpoolRow[],
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const rollups: Record<string, { ticker: string; activity_type: string; trading_date: string; trade_count: number; total_premium: number; total_dp_value: number; net_direction: string }> = {};

  // Rollup options
  for (const o of options) {
    if (EXCLUDED_TICKERS.has(o.ticker)) continue;
    const key = `${o.ticker}:options:${today}`;
    if (!rollups[key]) {
      rollups[key] = { ticker: o.ticker, activity_type: 'options', trading_date: today, trade_count: 0, total_premium: 0, total_dp_value: 0, net_direction: 'neutral' };
    }
    rollups[key].trade_count++;
    if (o.premium) rollups[key].total_premium += o.premium;
    if (o.direction === 'bullish') rollups[key].net_direction = 'bullish';
  }

  // Rollup dark pool
  for (const d of darkpool) {
    if (EXCLUDED_TICKERS.has(d.ticker)) continue;
    const key = `${d.ticker}:darkpool:${today}`;
    if (!rollups[key]) {
      rollups[key] = { ticker: d.ticker, activity_type: 'darkpool', trading_date: today, trade_count: 0, total_premium: 0, total_dp_value: 0, net_direction: 'neutral' };
    }
    rollups[key].trade_count++;
    if (d.dollar_value) rollups[key].total_dp_value += d.dollar_value;
    if (d.direction === 'buying') rollups[key].net_direction = 'bullish';
  }

  const rows = Object.values(rollups);
  if (rows.length === 0) return;

  const { error } = await supabase
    .from('ticker_activity_log')
    .upsert(rows, { onConflict: 'ticker,activity_type,trading_date' });

  if (error) {
    console.error('[flow-data] Activity log upsert error:', error.message);
  } else {
    console.log(`[flow-data] Upserted ${rows.length} activity log entries`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TICKER SCORING ENGINE
// Scores each ticker based on: volume, bullish call sweeps, sector tier,
// market cap, multi-day conviction, cross-signal convergence
// ══════════════════════════════════════════════════════════════════════════════

interface TickerScore {
  ticker: string;
  company: string | null;
  score: number;
  totalPremium: number;
  totalDarkpoolValue: number;
  bullishCallSweeps: number;
  tradeCount: number;
  topBet: string | null;
  topBetAmount: number;
  underlyingPrice: number | null;
  optionsCount: number;
  darkpoolCount: number;
  direction: string;
  signals: string[];
  // New fields for sector + conviction
  sector: string | null;
  sectorTier: number | null;
  marketCapB: number | null;
  conviction: string;       // 'standard', 'high', 'very_high'
  convictionDays: number;   // how many active days in last 5
  hasOptionsFlow: boolean;
  hasDarkpool: boolean;
  hasScannerAlert: boolean;
}

function scoreAndRank(
  options: OptionsFlowRow[],
  darkpool: DarkpoolRow[],
  sectorMap: Map<string, SectorInfo>,
  convictionMap: Map<string, ConvictionInfo[]>,
): TickerScore[] {
  const tickerMap = new Map<string, TickerScore>();

  const getOrCreate = (ticker: string, company: string | null): TickerScore => {
    if (!tickerMap.has(ticker)) {
      const sectorInfo = sectorMap.get(ticker);
      tickerMap.set(ticker, {
        ticker, company: company || sectorInfo?.company || null, score: 0,
        totalPremium: 0, totalDarkpoolValue: 0,
        bullishCallSweeps: 0, tradeCount: 0, optionsCount: 0, darkpoolCount: 0,
        topBet: null, topBetAmount: 0,
        underlyingPrice: null, direction: 'neutral',
        signals: [],
        sector: sectorInfo?.sector || null,
        sectorTier: sectorInfo?.sector_tier || null,
        marketCapB: sectorInfo?.market_cap_b || null,
        conviction: 'standard',
        convictionDays: 0,
        hasOptionsFlow: false,
        hasDarkpool: false,
        hasScannerAlert: false,
      });
    }
    return tickerMap.get(ticker)!;
  };

  // ── Score options flow ──
  for (const o of options) {
    const ts = getOrCreate(o.ticker, o.company);
    ts.tradeCount++;
    ts.optionsCount++;
    ts.hasOptionsFlow = true;

    if (o.premium) {
      ts.totalPremium += o.premium;
      if (o.premium > ts.topBetAmount) {
        ts.topBetAmount = o.premium;
        ts.topBet = o.bet_desc;
      }
    }

    const isSweep = (o.trade_type || '').includes('sweep');
    const isCall = o.option_type === 'call';
    const isBullish = o.direction === 'bullish';

    if (isBullish && isCall && isSweep) {
      ts.bullishCallSweeps++;
      ts.score += 25;
    } else if (isBullish && isCall) {
      ts.score += 15;
    } else if (isBullish) {
      ts.score += 8;
    } else if (o.direction === 'bearish') {
      ts.score -= 5;
    }

    if (o.is_unusual) ts.score += 10;

    if (o.premium && o.premium >= 1_000_000) ts.score += 20;
    else if (o.premium && o.premium >= 500_000) ts.score += 12;
    else if (o.premium && o.premium >= 100_000) ts.score += 5;

    if (o.underlying_price) ts.underlyingPrice = o.underlying_price;
  }

  // ── Score dark pool ──
  for (const d of darkpool) {
    const ts = getOrCreate(d.ticker, d.company);
    ts.tradeCount++;
    ts.darkpoolCount++;
    ts.hasDarkpool = true;

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

  // ── Finalize scores with all bonuses ──
  for (const [, ts] of tickerMap) {
    // Premium volume bonus (log scale)
    if (ts.totalPremium > 0) {
      ts.score += Math.min(30, Math.round(Math.log10(ts.totalPremium) * 5));
    }

    // Dark pool volume bonus
    if (ts.totalDarkpoolValue > 0) {
      ts.score += Math.min(20, Math.round(Math.log10(ts.totalDarkpoolValue) * 3));
    }

    // Activity count bonus
    if (ts.tradeCount >= 5) ts.score += 10;
    else if (ts.tradeCount >= 3) ts.score += 5;

    // ── NEW: Sector tier bonus ──
    if (ts.sectorTier) {
      const bonus = SECTOR_TIER_BONUS[ts.sectorTier] || 0;
      if (bonus > 0) {
        ts.score += bonus;
        ts.signals.push(`🏷️ Sector bonus +${bonus} (Tier ${ts.sectorTier})`);
      }
    }

    // ── NEW: Multi-day conviction check ──
    const convictions = convictionMap.get(ts.ticker);
    if (convictions && convictions.length > 0) {
      // Find max active days across options + darkpool
      let maxDays = 0;
      for (const c of convictions) {
        if (c.active_days > maxDays) maxDays = c.active_days;
      }
      ts.convictionDays = maxDays;

      if (maxDays >= 4) {
        // 4+ days = very high conviction — 2.5x multiplier
        ts.conviction = 'very_high';
        ts.score = Math.round(ts.score * 2.5);
        ts.signals.push(`🔥 Very high conviction: ${maxDays} days of activity`);
      } else if (maxDays >= 3) {
        // 3 days = high conviction — 2x multiplier
        ts.conviction = 'high';
        ts.score = Math.round(ts.score * 2.0);
        ts.signals.push(`🔥 High conviction: ${maxDays} days of activity`);
      }
    }

    // ── NEW: Cross-signal convergence bonus ──
    // If dark pool + options flow both active = strong convergence
    if (ts.hasOptionsFlow && ts.hasDarkpool) {
      ts.score += 20;
      ts.signals.push('🎯 Cross-signal: options + dark pool converging');
    }

    // Determine net direction
    const bullish = ts.bullishCallSweeps > 0 || ts.score > 20;
    ts.direction = bullish ? 'bullish' : ts.score < -10 ? 'bearish' : 'neutral';

    // Build signal descriptions
    if (ts.bullishCallSweeps > 0) {
      ts.signals.push(`${ts.bullishCallSweeps} bullish call sweep${ts.bullishCallSweeps > 1 ? 's' : ''} detected`);
    }
    if (ts.totalPremium >= 1_000_000) {
      ts.signals.push(`$${(ts.totalPremium / 1_000_000).toFixed(1)}M total options premium`);
    }
    if (ts.totalDarkpoolValue >= 1_000_000) {
      ts.signals.push(`$${(ts.totalDarkpoolValue / 1_000_000).toFixed(1)}M dark pool activity`);
    }
    if (ts.topBet) {
      ts.signals.push(`Biggest bet: ${ts.topBet} ($${(ts.topBetAmount / 1_000_000).toFixed(1)}M)`);
    }

    // Apply mega-cap penalty — they need 3x the signal to beat a mid-cap
    if (PENALIZED_TICKERS.has(ts.ticker)) {
      ts.score = Math.round(ts.score * 0.3);
    }
  }

  // Sort by score descending
  // Exclude ETFs/indexes + require at least 1 options trade
  // NEW: Filter by $3B minimum market cap if we have sector data for the ticker
  return Array.from(tickerMap.values())
    .filter(ts => {
      if (ts.score <= 0) return false;
      if (EXCLUDED_TICKERS.has(ts.ticker)) return false;
      // Require options flow OR significant dark pool activity
      if (ts.optionsCount < 1 && ts.darkpoolCount < 1) return false;
      // Market cap filter: if we have data and it's below $3B, skip
      if (ts.marketCapB !== null && ts.marketCapB < MIN_MARKET_CAP_B) {
        console.log(`[flow-data] ${ts.ticker}: filtered out (market cap $${ts.marketCapB}B < $${MIN_MARKET_CAP_B}B)`);
        return false;
      }
      return true;
    })
    .sort((a, b) => b.score - a.score);
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const url   = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';

    if (!force && !isMarketHours()) {
      console.log('[flow-data] Outside market hours — skipping');
      return json({ skipped: true, reason: 'outside market hours' });
    }

    const uwKey = Deno.env.get('UW_API_KEY');
    if (!uwKey) throw new Error('Missing env var: UW_API_KEY');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const results: Record<string, any> = {};
    const errors: string[] = [];
    let allOptions: OptionsFlowRow[] = [];
    let allDarkpool: DarkpoolRow[] = [];

    // ── 0. Load sector + conviction data ─────────────────────────────
    const [sectorMap, convictionMap] = await Promise.all([
      loadSectorMap(supabase),
      loadConvictionMap(supabase),
    ]);
    results.sectors_loaded = sectorMap.size;
    results.conviction_tickers = convictionMap.size;

    // ── 1. Fetch options flow alerts ──────────────────────────────────
    try {
      console.log('[flow-data] Fetching options flow...');
      const flowData = await uwGet('/api/option-trades/flow-alerts', uwKey);
      const rawFlow = Array.isArray(flowData) ? flowData : (flowData.data || flowData.trades || []);
      console.log(`[flow-data] Raw options flow: ${rawFlow.length} trades`);

      if (rawFlow.length > 0) {
        const parsed = parseOptionsFlow(rawFlow);
        const significant = parsed.filter(
          (t) => t.is_unusual || (t.premium && t.premium >= 50000)
        );
        const toInsert = significant.length > 0 ? significant : parsed.slice(0, 50);
        allOptions = toInsert;

        if (toInsert.length > 0) {
          const { error } = await supabase
            .from('options_flow')
            .upsert(toInsert, { onConflict: 'uw_id', ignoreDuplicates: true });
          if (error) errors.push(`options: ${error.message}`);
          else results.options_inserted = toInsert.length;
        }
      }
      results.options_raw = rawFlow.length;
    } catch (err: any) {
      console.error('[flow-data] Options flow error:', err.message);
      errors.push(`options: ${err.message}`);
    }

    // ── 2. Fetch dark pool trades ────────────────────────────────────
    try {
      console.log('[flow-data] Fetching dark pool...');
      const dpData = await uwGet('/api/darkpool/recent', uwKey);
      const rawDp = Array.isArray(dpData) ? dpData : (dpData.data || dpData.trades || []);
      console.log(`[flow-data] Raw dark pool: ${rawDp.length} trades`);

      if (rawDp.length > 0) {
        const parsed = parseDarkpool(rawDp);
        const large = parsed.filter(
          (t) => (t.dollar_value && t.dollar_value >= 500000) || (t.multiplier && t.multiplier >= 2)
        );
        const toInsert = large.length > 0 ? large : parsed.slice(0, 50);
        allDarkpool = toInsert;

        if (toInsert.length > 0) {
          const { error } = await supabase
            .from('darkpool_trades')
            .upsert(toInsert, { onConflict: 'uw_id', ignoreDuplicates: true });
          if (error) errors.push(`darkpool: ${error.message}`);
          else results.darkpool_inserted = toInsert.length;
        }
      }
      results.darkpool_raw = rawDp.length;
    } catch (err: any) {
      console.error('[flow-data] Dark pool error:', err.message);
      errors.push(`darkpool: ${err.message}`);
    }

    // ── 2.5. Upsert daily activity log (for multi-day tracking) ──────
    try {
      await upsertActivityLog(supabase, allOptions, allDarkpool);
    } catch (err: any) {
      console.error('[flow-data] Activity log error:', err.message);
      errors.push(`activity_log: ${err.message}`);
    }

    // ── 3. Score tickers and generate alerts for top N ────────────────
    try {
      const ranked = scoreAndRank(allOptions, allDarkpool, sectorMap, convictionMap);
      const topTickers = ranked.slice(0, TOP_N);
      console.log(`[flow-data] Scored ${ranked.length} tickers, top ${TOP_N}:`,
        topTickers.map(t => `${t.ticker}(${t.score},${t.conviction}${t.sector ? ','+t.sector : ''})`).join(', '));

      results.scored_tickers = ranked.length;
      results.top_tickers = topTickers.map(t => ({
        ticker: t.ticker, score: t.score, direction: t.direction,
        sweeps: t.bullishCallSweeps, premium: t.totalPremium,
        sector: t.sector, conviction: t.conviction,
        convictionDays: t.convictionDays, marketCapB: t.marketCapB,
      }));

      // Generate breakout_alerts for top tickers
      const alertsInserted: string[] = [];
      for (const ts of topTickers) {
        if (ts.score < 15) continue;

        // Check if already alerted today for this ticker + type
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const { data: existing } = await supabase
          .from('breakout_alerts')
          .select('id')
          .eq('signal_type', 'flow_signal')
          .eq('ticker', ts.ticker)
          .gte('created_at', today.toISOString())
          .limit(1);

        if (existing && existing.length > 0) {
          console.log(`[flow-data] ${ts.ticker}: already alerted today, skipping`);
          continue;
        }

        // Build alert body
        const signalText = ts.signals.slice(0, 4).join(' · ');
        const dirEmoji = ts.direction === 'bullish' ? '🟢' : ts.direction === 'bearish' ? '🔴' : '🟡';
        const convictionEmoji = ts.conviction === 'very_high' ? '🔥🔥' : ts.conviction === 'high' ? '🔥' : '';
        const confidence = Math.min(95, 60 + Math.round(ts.score / 3));

        const alertRow: Record<string, any> = {
          signal_type: 'flow_signal',
          ticker: ts.ticker,
          notes: `${dirEmoji}${convictionEmoji} ${ts.ticker} Flow Signal · ${signalText}`,
          price: ts.underlyingPrice || 0,
          volume: ts.tradeCount,           // Number of flow trades detected
          change_pct: 0,                   // Not a price change — flow signals don't have this
          rel_volume: ts.score,            // Signal score (frontend derives confidence from this)
          avg_volume: ts.totalPremium,     // Total options premium ($)
          volume_ratio: ts.bullishCallSweeps, // Number of bullish call sweeps
          gap_pct: ts.totalDarkpoolValue,  // Total dark pool dollar value
          pct_from_high: ts.optionsCount,  // Number of options flow trades
          high_52w: ts.darkpoolCount,      // Number of dark pool prints
          // New columns from migration
          sector: ts.sector || null,
          conviction: ts.conviction,
          sector_tier: ts.sectorTier || null,
        };

        const { error: alertErr } = await supabase.from('breakout_alerts').insert(alertRow);

        if (alertErr) {
          console.error(`[flow-data] Alert insert ${ts.ticker}:`, alertErr.message);
        } else {
          alertsInserted.push(ts.ticker);
          console.log(`[flow-data] ${ts.ticker}: ALERT CREATED (score=${ts.score}, conviction=${ts.conviction}, sector=${ts.sector}, confidence=${confidence})`);
        }
      }
      results.alerts_created = alertsInserted;

    } catch (err: any) {
      console.error('[flow-data] Scoring error:', err.message);
      errors.push(`scoring: ${err.message}`);
    }

    const summary = { ok: errors.length === 0, results, errors };
    console.log('[flow-data] Complete:', JSON.stringify(summary));
    return json(summary);

  } catch (err: any) {
    console.error('[flow-data] Fatal:', err.message);
    return json({ error: err.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
