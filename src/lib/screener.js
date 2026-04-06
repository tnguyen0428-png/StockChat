// ============================================
// UPTIKALERTS — screener.js
// Weekly stock screener engine
// Scores S&P 500 + Nasdaq 100 by 6 parameters
// ============================================

const FMP_KEY = import.meta.env.VITE_FMP_API_KEY;
const BASE    = 'https://financialmodelingprep.com/stable';

// ── S&P 500 + Nasdaq 100 tickers (hardcoded) ──
export const SCREENER_TICKERS = [
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
  'USB','PNC','TFC','SPGI','MCO','ICE','CME','MSCI','FIS','FISV',
  'MA','V','PYPL','SQ','COIN',
  // Energy
  'XOM','CVX','COP','EOG','SLB','MPC','PSX','VLO','OXY','PXD',
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
  'NFLX','DIS','CHTR','TMUS','VZ','T','CMCSA','EA','TTWO','ATVI',
  'GOOGL','META','SNAP','PINS','RBLX','WBD','PARA','FOX','FOXA',
  // Utilities / Other
  'NEE','DUK','SO','D','AEP','XEL','ED','EXC','SRE','PEG',
  'AWK','ES','WEC','ETR','PPL','CMS','NI','AES','FE','CNP',
  // Materials
  'LIN','APD','SHW','ECL','DD','DOW','NEM','FCX','ALB','CF',
  'MOS','FMC','IFF','PPG','VMC','MLM','NUE','STLD','RS','BALL',
  // Real Estate
  'AMT','PLD','CCI','EQIX','PSA','WELL','DLR','SPG','O','EQR',
  'AVB','VTR','BXP','KIM','REG','FRT','HST','MAA','UDR','CPT',
];

// ── Sector mapping ──
export const SECTOR_MAP = {
  Tech:         ['AAPL','MSFT','NVDA','GOOGL','GOOG','META','AVGO','ORCL','AMD','QCOM','INTC','TXN','MU','AMAT','KLAC','LRCX','ADI','MCHP','SNPS','CDNS','FTNT','PANW','CRWD','ZS','SNOW','PLTR','NOW','CRM','ADBE','INTU','TEAM','WDAY','DDOG','HUBS','MDB','NET','VEEV','ROP','ANSS','PTC'],
  Healthcare:   ['LLY','UNH','JNJ','ABBV','MRK','TMO','ABT','DHR','BMY','AMGN','GILD','ISRG','SYK','BSX','MDT','ELV','CI','CVS','HUM','CNC','BIIB','REGN','VRTX','MRNA','ILMN','A','IQV','DXCM','PODD','IDXX'],
  Finance:      ['BRK.B','JPM','BAC','WFC','GS','MS','BLK','SCHW','AXP','COF','USB','PNC','TFC','SPGI','MCO','ICE','CME','MSCI','FIS','FISV','MA','V','PYPL','SQ','COIN'],
  Energy:       ['XOM','CVX','COP','EOG','SLB','MPC','PSX','VLO','OXY','PXD','HAL','DVN','FANG','HES','BKR','CTRA','EQT','APA','MRO','NOV'],
  Industrial:   ['GE','HON','UPS','CAT','DE','LMT','RTX','NOC','GD','BA','EMR','ETN','PH','ITW','ROK','XYL','IR','CARR','OTIS','TT','FDX','DAL','UAL','ALK','AAL','CSX','UNP','NSC','CHRW','EXPD'],
  Consumer:     ['AMZN','TSLA','HD','MCD','NKE','SBUX','TGT','WMT','COST','TJX','LOW','BKNG','MAR','HLT','YUM','DPZ','CMG','ROST','EBAY','ETSY','DKNG','ABNB','UBER','LYFT','DASH'],
  Communication:['NFLX','DIS','CHTR','TMUS','VZ','T','CMCSA','EA','TTWO','SNAP','PINS','RBLX','WBD','PARA','FOX','FOXA'],
  General:      [],
};

// ── Fetch helpers ──
async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries) return null;
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// ── Score a single ticker ──
export async function scoreTicker(symbol) {
  try {
    const [ratios, earnings, profile] = await Promise.all([
      fetchWithRetry(`${BASE}/ratios?symbol=${symbol}&apikey=${FMP_KEY}`),
      fetchWithRetry(`${BASE}/earnings?symbol=${symbol}&apikey=${FMP_KEY}`),
      fetchWithRetry(`${BASE}/profile?symbol=${symbol}&apikey=${FMP_KEY}`),
    ]);

    if (!ratios?.[0] || !profile?.[0]) return null;

    const r = ratios[0];
    const p = profile[0];

    // ── 1. Earnings score (30%) ──
    const recentEarnings = (earnings || []).slice(0, 8).filter(e => e.epsActual != null && e.epsEstimated != null);
    const beats = recentEarnings.filter(e => e.epsActual >= e.epsEstimated).length;
    const beatRate = recentEarnings.length > 0 ? beats / recentEarnings.length : 0;

    // EPS growth (latest vs year ago)
    const eps = (earnings || []).filter(e => e.epsActual != null);
    const epsGrowth = eps.length >= 5
      ? (eps[0].epsActual - eps[4].epsActual) / Math.abs(eps[4].epsActual || 1)
      : 0;

    const earningsScore = Math.min(100, (beatRate * 60) + (Math.min(epsGrowth, 1) * 40));

    // ── 2. Fundamentals score (25%) ──
    const margin      = r.netProfitMargin || 0;
    const grossMargin = r.grossProfitMargin || 0;
    const debtEquity  = r.debtToEquityRatio || 0;
    const marginScore = Math.min(100, (margin * 200) + (grossMargin * 100));
    const debtScore   = Math.max(0, 100 - (debtEquity * 20));
    const fundScore   = (marginScore * 0.6) + (debtScore * 0.4);

    // ── 3. Sales growth YOY (20%) ──
    const revEarnings = (earnings || []).filter(e => e.revenueActual != null);
    const salesGrowth = revEarnings.length >= 5
      ? (revEarnings[0].revenueActual - revEarnings[4].revenueActual) / Math.abs(revEarnings[4].revenueActual || 1)
      : 0;
    const salesScore = Math.min(100, Math.max(0, salesGrowth * 200));

    // ── 4. Valuation score (10%) ──
    const pe  = r.priceToEarningsRatio || 999;
    const peg = r.priceToEarningsGrowthRatio || 999;
    const peScore  = pe  > 0 && pe  < 100 ? Math.max(0, 100 - pe)  : 0;
    const pegScore = peg > 0 && peg < 5   ? Math.max(0, 100 - (peg * 20)) : 0;
    const valScore = (peScore * 0.5) + (pegScore * 0.5);

    // ── 5. Price trend 6 months (10%) ──
    const range = p.range?.split('-');
    const low6m  = parseFloat(range?.[0]) || p.price;
    const high6m = parseFloat(range?.[1]) || p.price;
    const pricePosition = high6m > low6m
      ? (p.price - low6m) / (high6m - low6m)
      : 0.5;
    const trendScore = pricePosition * 100;

    // ── 6. Market cap score (5%) ──
    const mcap = p.marketCap || 0;
    const mcapScore = mcap > 1e12 ? 100 : mcap > 1e11 ? 80 : mcap > 1e10 ? 60 : mcap > 1e9 ? 40 : 20;

    // ── Final weighted score ──
    const totalScore = Math.round(
      (earningsScore * 0.30) +
      (fundScore     * 0.25) +
      (salesScore    * 0.20) +
      (valScore      * 0.10) +
      (trendScore    * 0.10) +
      (mcapScore     * 0.05)
    );

    // ── Auto-generate thesis ──
    const thesis = generateThesis(symbol, p, r, beatRate, epsGrowth, salesGrowth);

    return {
      symbol,
      score:        totalScore,
      sector:       p.sector || 'General',
      price:        p.price,
      marketCap:    p.marketCap,
      pe:           r.priceToEarningsRatio,
      peg:          r.priceToEarningsGrowthRatio,
      netMargin:    r.netProfitMargin,
      grossMargin:  r.grossProfitMargin,
      debtEquity:   r.debtToEquityRatio,
      beatRate:     Math.round(beatRate * 100),
      epsGrowth:    Math.round(epsGrowth * 100),
      salesGrowth:  Math.round(salesGrowth * 100),
      thesis,
    };
  } catch (err) {
    console.error(`scoreTicker ${symbol} failed:`, err.message);
    return null;
  }
}

// ── Auto-generate thesis text ──
function generateThesis(symbol, profile, ratios, beatRate, epsGrowth, salesGrowth) {
  const parts = [];

  if (beatRate >= 0.75) parts.push(`${symbol} has beaten earnings estimates in ${Math.round(beatRate * 100)}% of recent quarters.`);
  if (epsGrowth > 0.1)  parts.push(`EPS has grown ${Math.round(epsGrowth * 100)}% over the past year.`);
  if (salesGrowth > 0.05) parts.push(`Revenue grew ${Math.round(salesGrowth * 100)}% YOY.`);
  if (ratios.netProfitMargin > 0.15) parts.push(`Net margin of ${Math.round(ratios.netProfitMargin * 100)}% reflects strong profitability.`);
  if (ratios.priceToEarningsGrowthRatio > 0 && ratios.priceToEarningsGrowthRatio < 1.5) parts.push(`PEG ratio of ${ratios.priceToEarningsGrowthRatio?.toFixed(2)} suggests reasonable valuation relative to growth.`);
  if (profile.marketCap > 1e12) parts.push(`Large-cap stability with $${(profile.marketCap / 1e12).toFixed(1)}T market cap.`);

  return parts.length > 0
    ? parts.join(' ')
    : `${symbol} is a ${profile.sector || 'market'} stock with a current price of $${profile.price?.toFixed(2)}.`;
}

// ── Run full screener for a sector ──
export async function runScreener(sector, onProgress) {
  const tickers = SECTOR_MAP[sector] || [];

  if (tickers.length === 0) {
    console.log('No tickers found for sector:', sector);
    return [];
  }

  console.log('Running screener for', sector, 'with', tickers.length, 'tickers');

  const results = [];
  let processed = 0;

  const batchSize = 5;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const scores = await Promise.all(batch.map(t => scoreTicker(t)));
    scores.forEach(s => { if (s) results.push(s); });
    processed += batch.length;
    onProgress?.(Math.round((processed / tickers.length) * 100));
    if (i + batchSize < tickers.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log('Screener complete:', results.length, 'results');

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
}
