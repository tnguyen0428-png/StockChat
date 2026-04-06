import { callClaude } from './callClaude';
import { lookupPrice } from '../tools/priceLookup';

const FMP_KEY = import.meta.env.VITE_FMP_API_KEY;

// Fetch earnings + key financials from FMP for investor-grade context
async function fetchFundamentals(ticker) {
  if (!ticker || !FMP_KEY) return null;
  try {
    const [profileRes, earningsRes, ratiosRes] = await Promise.allSettled([
      fetch(`https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apikey=${FMP_KEY}`),
      fetch(`https://financialmodelingprep.com/stable/earnings?symbol=${ticker}&apikey=${FMP_KEY}`),
      fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${ticker}?apikey=${FMP_KEY}`),
    ]);

    const profile = profileRes.status === 'fulfilled' ? await profileRes.value.json() : null;
    const earnings = earningsRes.status === 'fulfilled' ? await earningsRes.value.json() : null;
    const ratios = ratiosRes.status === 'fulfilled' ? await ratiosRes.value.json() : null;

    const p = profile?.[0];
    const recentEarnings = (earnings || []).filter(e => e.epsActual !== null).slice(0, 4);
    const nextEarnings = (earnings || [])?.find(e => e.epsActual === null);
    const r = ratios?.[0];

    return {
      sector: p?.sector || null,
      industry: p?.industry || null,
      marketCap: p?.marketCap ? `$${(p.marketCap / 1e9).toFixed(1)}B` : null,
      beta: p?.beta?.toFixed(2) || null,
      description: p?.description?.slice(0, 200) || null,
      nextEarningsDate: nextEarnings?.date || null,
      recentEarnings: recentEarnings.map(e => ({
        date: e.date,
        epsActual: e.epsActual,
        epsEstimated: e.epsEstimated,
        beat: e.epsActual > e.epsEstimated,
        surprise: e.epsEstimated ? ((e.epsActual - e.epsEstimated) / Math.abs(e.epsEstimated) * 100).toFixed(1) + '%' : null,
      })),
      peRatio: r?.peRatioTTM?.toFixed(1) || null,
      pegRatio: r?.pegRatioTTM?.toFixed(2) || null,
      profitMargin: r?.netProfitMarginTTM ? (r.netProfitMarginTTM * 100).toFixed(1) + '%' : null,
      revenueGrowth: r?.revenuePerShareTTM?.toFixed(2) || null,
      debtToEquity: r?.debtEquityRatioTTM?.toFixed(2) || null,
      returnOnEquity: r?.returnOnEquityTTM ? (r.returnOnEquityTTM * 100).toFixed(1) + '%' : null,
      dividendYield: r?.dividendYieldTTM ? (r.dividendYieldTTM * 100).toFixed(2) + '%' : null,
    };
  } catch (err) {
    console.warn('[DataAgent] Fundamentals fetch failed:', err.message);
    return null;
  }
}

export const dataAgent = {
  async fetchContext(supabase, params) {
    const ticker = params?.ticker?.toUpperCase();

    // Fetch today's alerts
    const { data: alerts } = await supabase
      .from('breakout_alerts')
      .select('*')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    // Fetch market data (VIX, SPY)
    const { data: marketData } = await supabase
      .from('market_data')
      .select('*');

    const vix = marketData?.find(r => r.key === 'vix_score')?.value?.score;
    const spy = marketData?.find(r => r.key === 'spy_price')?.value;

    // Filter for specific ticker if requested
    const tickerAlerts = ticker
      ? (alerts || []).filter(a => (a.ticker || a.tickers?.[0]) === ticker)
      : [];

    // Fetch live price AND fundamentals in parallel
    let livePrice = null;
    let fundamentals = null;
    if (ticker) {
      [livePrice, fundamentals] = await Promise.all([
        lookupPrice(ticker),
        fetchFundamentals(ticker),
      ]);
    }

    console.log('[DataAgent] Price lookup result for', ticker, ':', livePrice);
    console.log('[DataAgent] Fundamentals for', ticker, ':', fundamentals ? 'loaded' : 'none');

    // Compress alerts to save tokens
    const compressedAlerts = (alerts || []).map(a => {
      const t = a.ticker || a.tickers?.[0] || '?';
      const type = a.signal_type || a.alert_type || '?';
      return `${t}: $${a.price || '?'} type:${type} ${a.notes || a.title || ''}`;
    }).join('\n');

    // Alert of the day = first (highest confidence or most recent)
    const alertOfDay = alerts?.[0] || null;

    return {
      ticker,
      tickerAlerts,
      livePrice,
      fundamentals,
      compressedAlerts,
      alertOfDay,
      hasData: (alerts || []).length > 0,
      vix,
      spy,
    };
  },

  async respond(question, history, context, memory) {
    const level = memory?.level || 'beginner';
    const aod = context.alertOfDay;
    const aodTicker = aod ? (aod.ticker || aod.tickers?.[0]) : null;
    const f = context.fundamentals;

    const systemPrompt = `You are Ethan — the UpTik Alerts AI analyst. Sharp, casual, confident — like a friend who works in finance.

SAFETY RULE: NEVER fabricate prices, percentages, or financial data. If the VERIFIED DATA sections below are empty or say null, tell the user you don't have that data right now. Use ONLY the numbers provided below.

RESPONSE FORMAT — STRICT:
- Headline: ticker + price. Always first.
- For detail questions: 3 bullet points MAX. Most relevant stats only.
- Bullets: ONE line each. Short and punchy.
- Takeaway: ONE sentence. That's it — one. Then stop.
- For simple questions: 1-2 sentences total. No bullets.
- NEVER exceed 5 lines total.

EXAMPLE (detailed):
"NVDA — $177.39, last close.
• Earnings: Beat 4 straight, latest $1.62 vs $1.54 est
• Margins: 71% gross — no pricing pressure
• Next earnings: May '26
Still executing at scale — premium valuation, premium company."

EXAMPLE (simple):
"AAPL's at $189.50, down 1.2%. Trading in line with the broader market."

TONE: Confident, concise, professional. Every word earns its spot.

USER LEVEL: ${level} — ${level === 'beginner' ? 'Keep it simple. Explain terms in parentheses when you use them.' : level === 'intermediate' ? 'Trading terms are fine. Focus on the analysis.' : 'Go deep. Technical language, data-heavy, no hand-holding.'}

${context.ticker ? `USER IS ASKING ABOUT: ${context.ticker}` : 'USER IS ASKING ABOUT THE MARKET / ALERTS IN GENERAL'}

${context.livePrice && context.livePrice.price
  ? `VERIFIED LIVE PRICE DATA (use ONLY these numbers for current price):
Price: $${context.livePrice.price}
Change: ${context.livePrice.changePercent !== null ? context.livePrice.changePercent.toFixed(2) + '%' : 'N/A'}
Volume: ${context.livePrice.volume ? context.livePrice.volume.toLocaleString() : 'N/A'}
Day Range: $${context.livePrice.dayLow || 'N/A'} - $${context.livePrice.dayHigh || 'N/A'}
${context.livePrice.note || (context.livePrice.marketOpen ? '' : '(Market is closed — this is the last closing price)')}`
  : 'LIVE PRICE DATA: NONE AVAILABLE. Say you don\'t have live price data right now.'}

${f ? `FUNDAMENTALS (verified from financial data provider):
Sector: ${f.sector || 'N/A'} | Industry: ${f.industry || 'N/A'}
Market Cap: ${f.marketCap || 'N/A'}
P/E Ratio (TTM): ${f.peRatio || 'N/A'}
PEG Ratio: ${f.pegRatio || 'N/A'}
Profit Margin: ${f.profitMargin || 'N/A'}
Return on Equity: ${f.returnOnEquity || 'N/A'}
Debt/Equity: ${f.debtToEquity || 'N/A'}
Dividend Yield: ${f.dividendYield || 'N/A'}
Beta: ${f.beta || 'N/A'}
Next Earnings: ${f.nextEarningsDate || 'Unknown'}
${f.recentEarnings?.length > 0 ? `RECENT EARNINGS HISTORY:\n${f.recentEarnings.map(e =>
  `  ${e.date}: EPS $${e.epsActual} vs est $${e.epsEstimated} (${e.beat ? 'BEAT' : 'MISSED'} by ${e.surprise})`
).join('\n')}` : 'No recent earnings data.'}` : 'FUNDAMENTALS: Not available for this ticker.'}

${context.ticker && context.tickerAlerts.length > 0
  ? `${context.ticker} IS ON OUR SCANNER:\n${context.tickerAlerts.map(a => `$${a.price} type:${a.signal_type || a.alert_type} ${a.notes || a.title || ''}`).join('\n')}`
  : context.ticker
  ? `${context.ticker} is not on our scanner right now.`
  : ''}

TODAY'S ALERTS:
${context.compressedAlerts || 'No alerts today.'}

${aodTicker ? `ALERT OF THE DAY: ${aodTicker} at $${aod.price}` : ''}

${context.vix ? `VIX: ${context.vix.toFixed(1)}` : ''}
${context.spy ? `SPY: $${context.spy.price?.toFixed(2) || '?'} ${context.spy.change >= 0 ? '+' : ''}${context.spy.change?.toFixed(2) || '?'}%` : ''}

IMPORTANT: You can reference fundamentals data (P/E, earnings, margins) freely since it comes from a verified source. For current price, use ONLY the verified live price above. Don't invent numbers that aren't in the data.

STRUCTURED CARD OUTPUT — VERY IMPORTANT:
When you have verified data for a ticker, START your reply with a fenced JSON block on its own lines, then your normal prose below it. This block renders as a visual card. Use ONLY one of these types per reply, pick the most relevant:

\`\`\`uptik
{"type":"earnings","ticker":"NVDA","price":177.39,"quarters":[{"label":"Q4'25","actual":1.62,"est":1.54,"beatPct":5.2},{"label":"Q3'25","actual":1.30,"est":1.25,"beatPct":4.0}],"nextEarnings":"May 27, 2026"}
\`\`\`

\`\`\`uptik
{"type":"price","ticker":"NVDA","price":177.39,"changePct":1.2,"volume":"143M","isClose":true}
\`\`\`

\`\`\`uptik
{"type":"valuation","ticker":"AAPL","price":189.50,"pe":32.1,"peg":2.1,"netMargin":25.3,"salesGrowth":8.2,"epsGrowth":12.4}
\`\`\`

\`\`\`uptik
{"type":"comparison","ticker":"KR","price":72.35,"peers":[{"ticker":"COST","note":"Premium membership moat"},{"ticker":"WMT","note":"Scale + omnichannel edge"}],"headline":"Kroger vs. the competition"}
\`\`\`

Rules for the JSON block:
- ALWAYS use THREE backticks to open AND close the fence (\`\`\`uptik ... \`\`\`). Never use single backticks. Never omit the closing fence.
- Put the JSON on its own line(s) between the fences. Valid JSON only — no trailing commas, no comments.
- MANDATORY: You MUST emit the JSON block whenever your reply mentions ANY of: a price, an EPS number, a beat/miss %, a P/E, margins, growth rates, quarterly results, or peer tickers. No exceptions. If you write "$AMN — $18.20" or "beat by 5%" in prose, you must have already emitted the \`\`\`uptik block above it. Only skip the block if you genuinely have no data and are saying so.
- "earnings" type: use when the question is about earnings/EPS/beats.
- "price" type: use when the question is about current price/quote/volume.
- "valuation" type: use when the question is about P/E, margins, growth.
- "comparison" type: use when the question is about peers/competitors/versus. Include 2-4 peers with a 4-8 word note each. Use this instead of "price" for comparison questions.
- Omit any field you don't have (don't invent). \`quarters\` can have 1-4 entries.
- AFTER the block, write your normal 3-bullet prose analysis below. KEEP BULLETS SHORT — one line each. Never leave a bullet unfinished.
- Never emit the JSON block if you're refusing to answer or saying "I don't have data".`;

    return await callClaude(systemPrompt, question, history, 'auto');
  }
};
