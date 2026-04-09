import { callClaude } from './callClaude';
import { lookupPrice } from '../tools/priceLookup';
import { buildFeedbackContext } from '../feedbackContext';

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

// Fetch latest earnings call transcript and extract guidance sections
async function fetchGuidance(ticker) {
  if (!ticker || !FMP_KEY) return null;
  try {
    // First get available transcript dates
    const datesRes = await fetch(
      `https://financialmodelingprep.com/api/v4/earning_call_transcript?symbol=${ticker}&apikey=${FMP_KEY}`
    );
    if (!datesRes.ok) return null;
    const dates = await datesRes.json();
    if (!dates?.length) return null;

    // Get the most recent transcript
    const latest = dates[0];
    const transcriptRes = await fetch(
      `https://financialmodelingprep.com/api/v3/earning_call_transcript/${ticker}?quarter=${latest.quarter}&year=${latest.year}&apikey=${FMP_KEY}`
    );
    if (!transcriptRes.ok) return null;
    const transcript = await transcriptRes.json();
    const content = transcript?.[0]?.content;
    if (!content) return null;

    // Extract guidance-relevant sentences
    const guidanceKeywords = /\b(guidance|outlook|expect|forecast|anticipate|project|target|range|full.?year|next quarter|looking ahead|going forward|revenue.{0,20}(between|range|expect)|eps.{0,20}(between|range|expect))\b/i;
    const sentences = content.split(/(?<=[.!?])\s+/);
    const guidanceSentences = sentences.filter(s => guidanceKeywords.test(s)).slice(0, 8);

    if (guidanceSentences.length === 0) return null;

    return {
      quarter: `Q${latest.quarter}'${String(latest.year).slice(-2)}`,
      year: latest.year,
      guidanceExcerpts: guidanceSentences.join(' ').slice(0, 800),
    };
  } catch (err) {
    console.warn('[DataAgent] Guidance fetch failed:', err.message);
    return null;
  }
}

export const dataAgent = {
  async fetchContext(supabase, params) {
    const ticker = params?.ticker?.toUpperCase();
    const needsTranscript = params?.needsTranscript || false;

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

    // Fetch live price, fundamentals, and optionally guidance in parallel
    let livePrice = null;
    let fundamentals = null;
    let guidance = null;
    if (ticker) {
      const fetches = [
        lookupPrice(ticker),
        fetchFundamentals(ticker),
      ];
      if (needsTranscript) fetches.push(fetchGuidance(ticker));

      const results = await Promise.all(fetches);
      livePrice = results[0];
      fundamentals = results[1];
      guidance = results[2] || null;
    }

    console.log('[DataAgent] Price lookup result for', ticker, ':', livePrice);
    console.log('[DataAgent] Fundamentals for', ticker, ':', fundamentals ? 'loaded' : 'none');
    if (needsTranscript) console.log('[DataAgent] Guidance for', ticker, ':', guidance ? 'loaded' : 'none');

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
      guidance,
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
    const g = context.guidance;

    const systemPrompt = `You are UpTik AI — the resident analyst for UpTikAlerts, a stock trading community focused on actionable fundamentals.

DATA RULES:
- When VERIFIED DATA is provided below, use those exact numbers for price and financials.
- When live data is NOT available, use your general knowledge of the company. You know plenty — business models, sectors, products, competitive positions. Always answer.
- NEVER say "I don't have data" or tell the user to go look it up.
- Do NOT fabricate specific current prices or exact financial figures you don't have.

RESPONSE STRUCTURE — follow this for every response:

STEP 1 — PICK THE RIGHT CARD (or no card):
- "Tell me about X" / "how's X doing" → PRICE card only. Never earnings card for casual asks.
- "Analyze X" / "break down X" → EARNINGS card with 2 most recent quarters, or VALUATION card.
- "Earnings history" / "show earnings" / "how many beats" → EARNINGS card with up to 4 quarters.
- "Compare X to Y" → COMPARISON card.
- Quick factual question (date, sector, yes/no) → NO card. Plain text only.

STEP 2 — WRITE PROSE THAT ADDS VALUE BEYOND THE CARD:
The card already shows the numbers. Your prose must add what the card CANNOT show:
- FIRST: What does the company do? One line — their core business. ("Fiber optic networking components manufacturer" or "Solid oxide fuel cell maker for data centers")
- SECOND: Connect to a relevant theme or sector trend when applicable. ("Positioned in the AI data center supply chain" or "Beneficiary of clean energy infrastructure spending")
- THIRD: One standout data point the card doesn't show — earnings trend, margin trajectory, or notable metric.
- FOURTH: Forward-looking anchor — next earnings date, upcoming catalyst, or key risk.
- NEVER restate what the card already displays. The card has price, change, and earnings — don't repeat those numbers in your prose.

RESPONSE LENGTH — match the depth to what the user asked:
- Quick questions → 1 sentence.
- Broad questions ("tell me about X") → 2-3 sentences. Company description + theme + one metric + forward anchor.
- Detailed requests ("analyze X", "break down X") → 4-6 sentences. Full context with data.
- The user controls the depth.

VOICE:
- Professional but natural. Like a research analyst explaining to a colleague, not reading a report.
- Use proper financial terms: "beat estimates by 12%" not "crushed it", "volatile" not "swings hard"
- Contractions are fine. "They're", "doesn't", "it's" — keep it natural.
- Weave data into narrative. "Beat estimates 3 of the last 4 quarters, with the most recent showing a 91.7% surprise" reads better than listing each quarter.
- NEVER start with "Great question!" or any preamble.
- NEVER end with a question.
- Mix up your openings.

OPINIONS:
- Default: NO opinions. Present data and let the user decide.
- Only give a measured take when explicitly asked ("what do you think?", "would you buy?")
- When asked, ground it in data. Never steer toward or away from a stock.

USER LEVEL: ${level} — ${level === 'beginner' ? 'Keep it simple. Define financial terms briefly when you use them.' : level === 'intermediate' ? 'Standard financial terminology is fine.' : 'Technical and data-heavy. No hand-holding.'}

${context.ticker ? `USER IS ASKING ABOUT: ${context.ticker}` : 'USER IS ASKING ABOUT THE MARKET / ALERTS IN GENERAL'}

${context.livePrice && context.livePrice.price
  ? `VERIFIED LIVE PRICE DATA:
Price: $${context.livePrice.price}
Change: ${context.livePrice.changePercent !== null ? context.livePrice.changePercent.toFixed(2) + '%' : 'N/A'}
Volume: ${context.livePrice.volume ? context.livePrice.volume.toLocaleString() : 'N/A'}
${context.livePrice.note || (context.livePrice.marketOpen ? '' : '(Last closing price)')}`
  : 'LIVE PRICE DATA: Not available. Use your general knowledge.'}

${f ? `FUNDAMENTALS:
Sector: ${f.sector || 'N/A'} | Industry: ${f.industry || 'N/A'}
Market Cap: ${f.marketCap || 'N/A'}
P/E (TTM): ${f.peRatio || 'N/A'} | PEG: ${f.pegRatio || 'N/A'}
Profit Margin: ${f.profitMargin || 'N/A'} | ROE: ${f.returnOnEquity || 'N/A'}
Debt/Equity: ${f.debtToEquity || 'N/A'} | Beta: ${f.beta || 'N/A'}
Next Earnings: ${f.nextEarningsDate || 'Unknown'}
${f.description ? `Company: ${f.description}` : ''}
${f.recentEarnings?.length > 0 ? `Earnings: ${f.recentEarnings.map(e =>
  `${e.date}: $${e.epsActual} vs est $${e.epsEstimated} (${e.beat ? 'BEAT' : 'MISSED'} ${e.surprise})`
).join(' | ')}` : ''}` : 'FUNDAMENTALS: Not available from feed. Use your general knowledge.'}

${g ? `COMPANY GUIDANCE (${g.quarter}): ${g.guidanceExcerpts}` : ''}

${context.ticker && context.tickerAlerts.length > 0
  ? `ON SCANNER: ${context.tickerAlerts.map(a => `$${a.price} ${a.signal_type || a.alert_type}`).join(', ')}`
  : ''}

${aodTicker ? `ALERT OF THE DAY: ${aodTicker} at $${aod.price}` : ''}
${context.vix ? `VIX: ${context.vix.toFixed(1)}` : ''}${context.spy ? ` | SPY: $${context.spy.price?.toFixed(2) || '?'} ${context.spy.change >= 0 ? '+' : ''}${context.spy.change?.toFixed(2) || '?'}%` : ''}

CARD TEMPLATES — use the type selected in STEP 1:

\`\`\`uptik
{"type":"price","ticker":"NVDA","price":177.39,"changePct":1.2,"volume":"143M","isClose":true}
\`\`\`

\`\`\`uptik
{"type":"earnings","ticker":"NVDA","price":177.39,"quarters":[{"label":"Q4'25","actual":1.62,"est":1.54,"beatPct":5.2}],"nextEarnings":"May 27, 2026"}
\`\`\`

\`\`\`uptik
{"type":"valuation","ticker":"AAPL","price":189.50,"pe":32.1,"peg":2.1,"netMargin":25.3,"salesGrowth":8.2,"epsGrowth":12.4}
\`\`\`

\`\`\`uptik
{"type":"comparison","ticker":"KR","price":72.35,"peers":[{"ticker":"COST","note":"Premium membership moat"},{"ticker":"WMT","note":"Scale + omnichannel edge"}],"headline":"Kroger vs. the competition"}
\`\`\`

JSON rules: THREE backticks to open and close. Valid JSON only. Omit fields you don't have.${buildFeedbackContext(memory)}`;

    // Use Sonnet for data agent — better at card selection and meaningful prose
    return await callClaude(systemPrompt, question, history, 'smart', null, 0.4);
  }
};
