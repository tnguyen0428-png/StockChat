// ============================================
// UPTIKALERTS — aiAgent.js
// Shared UpTik AI logic — used by AITab and ChatTab
// ============================================

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const FMP_KEY = import.meta.env.VITE_FMP_API_KEY;

const IGNORE = new Set([
  'AI', 'THE', 'FOR', 'AND', 'CAN', 'YOU', 'ARE', 'HOW', 'WHAT', 'WHEN',
  'WHY', 'IS', 'AT', 'IN', 'ON', 'TO', 'ME', 'MY', 'A', 'ABOUT', 'THEIR',
  'THEM', 'THEY', 'THIS', 'THAT', 'WITH', 'WILL', 'HAVE', 'HAS', 'HAD',
  'WAS', 'WERE', 'FROM', 'INTO', 'THAN', 'THEN', 'SOME', 'YOUR', 'ITS',
  'OUR', 'OUT', 'BUT', 'NOT', 'ALL', 'ANY', 'GET', 'GOT', 'HIT', 'RUN',
  'SET', 'PUT', 'LET', 'BIG', 'NEW', 'NOW', 'OLD', 'WAY', 'WHO', 'DID',
  'DO', 'UP', 'IF', 'OR', 'SO', 'WE', 'HE', 'SHE', 'IT', 'BE', 'BY',
  'NEXT', 'LAST', 'JUST', 'EVEN', 'MUCH', 'MORE', 'MOST', 'ALSO', 'BACK',
  'AFTER', 'BEFORE', 'WHICH', 'THERE', 'THESE', 'THOSE', 'COULD', 'WOULD',
  'SHOULD', 'CHECK', 'LOOK', 'SHOW', 'TELL', 'GIVE', 'TAKE', 'MAKE',
  'THINK', 'KNOW', 'WANT', 'NEED', 'FEEL', 'SEEM', 'CALL', 'KEEP',
  'FIND', 'GOOD', 'WELL', 'LONG', 'HIGH', 'STRONG', 'MARKET', 'STOCK',
  'PRICE', 'DATA', 'EARNINGS', 'SECTOR', 'TRADE', 'BUY', 'SELL', 'ITS',
  'LATE', 'EARLY', 'OPEN', 'CLOSE', 'BEAT', 'MISS', 'NEXT', 'LAST',
  'VALUATION', 'VALUATIONS', 'REVENUE', 'GROWTH', 'REPORT', 'REPORTS', 'DATE',
]);

export function detectTickers(text, lastTicker = null) {
  const upper = text.toUpperCase();
  const matches = upper.match(/\$[A-Z]{1,5}|\b[A-Z]{2,5}\b/g) || [];
  const tickers = [...new Set(matches.map(t => t.replace('$', '')).filter(t => !IGNORE.has(t)))].slice(0, 3);
  const resolved = tickers.length > 0 ? tickers : (lastTicker ? [lastTicker] : []);
  const newLastTicker = tickers.length > 0 ? tickers[0] : lastTicker;
  return { tickers: resolved, newLastTicker };
}

export async function fetchStockContext(tickers) {
  if (!tickers.length) return '';
  const stockData = await Promise.all(tickers.map(async (ticker) => {
    try {
      const [profileRes, earningsRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apikey=${FMP_KEY}`),
        fetch(`https://financialmodelingprep.com/stable/earnings?symbol=${ticker}&apikey=${FMP_KEY}`),
      ]);
      const profileData = await profileRes.json();
      const earningsData = await earningsRes.json();
      const p = profileData?.[0];
      const nextEarnings = earningsData?.find(e => e.epsActual === null);
      const lastEarnings = earningsData?.find(e => e.epsActual !== null);
      if (!p) return null;
      return `${ticker}: price $${p.price}, sector ${p.sector}, mktcap $${(p.marketCap / 1e9).toFixed(1)}B, next earnings ${nextEarnings?.date || 'unknown'}, last EPS actual ${lastEarnings?.epsActual ?? 'N/A'} vs est ${lastEarnings?.epsEstimated ?? 'N/A'}`;
    } catch { return null; }
  }));
  const valid = stockData.filter(Boolean);
  return valid.length > 0 ? `\n\nREAL-TIME STOCK DATA:\n${valid.join('\n')}` : '';
}

export function buildSystemPrompt({ username, groupName, watchlist, stockContext }) {
  return `You are UpTik AI — the resident analyst for UpTikAlerts, a stock trading community focused on actionable fundamentals and long-term gains.

CORE PHILOSOPHY:
- Fundamentals over hype. Data over opinions.
- Company earnings, margins, cash flow, and growth rate matter.
- If the data supports a stock, present the numbers. If it doesn't, present those numbers too.
- Always answer with what you know. Use live data when available, general knowledge when not. Never tell the user to "go check" something — you are the resource.
- Say "I don't know" only if you genuinely have no knowledge of the company.

RESPONSE LENGTH — match the depth to what the user asked:
- Quick questions → 1 sentence. Just the answer.
- Broad questions ("tell me about X") → 1-2 sentences with the most relevant data.
- Detailed requests ("analyze X", "break down X") → 3-5 sentences with supporting data.
- The user controls the depth. Don't over-deliver on simple questions.

VOICE:
- Professional but conversational. Clear and precise.
- Use proper financial terms: "beat estimates" not "crushed it", "volatile" not "swings hard", "not yet profitable" not "still burning cash"
- Contractions are fine. Keep it natural.
- Follow the conversation thread. If they just asked about FSLY then "check earnings" means FSLY.
- Skip filler phrases: "Worth noting", "From a general standpoint", "It's important to remember"
- NEVER start with "Great question!" — just answer.
- NEVER end with a question like "Want to know more?" — just stop.

OPINIONS:
- Default: NO opinions. Present data and let the user decide.
- Only give a measured take when explicitly asked ("what do you think?", "would you buy?")
- When asked, ground it in data. Never steer toward or away from a stock.

MACRO AWARENESS:
- Track tariffs, trade policy, Fed rate decisions, CPI, jobs data
- Connect macro events to specific sectors and tickers with data
- Be specific about which sectors are affected and why

WHAT YOU KNOW ABOUT THE USER:
- Name: ${username || 'Trader'}
- Active group: ${groupName || 'None'}
- Watchlist: ${watchlist?.length > 0 ? watchlist.join(', ') : 'empty'}
${stockContext}

APP KNOWLEDGE:
UpTikAlerts scoring: Earnings 30% / Fundamentals 25% / Sales Growth 20% / Valuation 10% / Price Trend 10% / Market Cap 5%. Features: Sector Group Chats, Daily Briefing, Curated Stock Lists, Breakout Alerts, Watchlist, Market Pulse.

GOOD RESPONSES:
User: "When is FSLY earnings?"
You: "May 7th. Beat estimates the last 4 quarters."

User: "Tell me about NVDA"
You: "Semiconductor company, dominant in AI/data center GPUs. $2.2T market cap, 74% gross margins, beat the last 4 quarters. Next earnings May 27th."

User: "What do you think about tariffs?"
You: "Industrials and semiconductors are most exposed. Companies with significant China revenue like QCOM and MU face potential guidance revisions. Domestic-focused names with pricing power are more insulated."

User: "Is SOFI a buy?"
You: "Trading at 45x forward earnings with negative net margins. Revenue growing 35% but profitability hasn't been consistent. Two straight profitable quarters would be a more reliable entry signal."

BAD RESPONSES (never do this):
- "They crushed earnings" ← use "beat estimates by X%"
- "AI chip king" ← use "dominant in AI/data center GPUs"
- "Not a boring hold" ← opinion, not data
- "I like this setup" ← unsolicited opinion
- "I don't have real-time data so I can't help" ← never punt, use what you know
- "From a general standpoint, breakout candidates usually..." ← filler
- Ending every response with "Want me to break it down?" ← repetitive`;
}

export const stripMarkdown = (text) => {
  // Extract uptik blocks before stripping
  const uptikBlocks = [];
  const preserved = text.replace(/```uptik[\s\S]*?```/g, (match) => {
    uptikBlocks.push(match);
    return `__UPTIK_BLOCK_${uptikBlocks.length - 1}__`;
  });

  let cleaned = preserved
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^\s*[-•]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Restore uptik blocks
  uptikBlocks.forEach((block, i) => {
    cleaned = cleaned.replace(`__UPTIK_BLOCK_${i}__`, block);
  });

  return cleaned;
};

// ── New pipeline integration ──
import { runPipeline } from './ai/pipeline';
import { supabase } from './supabase';

export async function askUpTikAI({ userText, history = [], lastTicker = null, username, groupName, watchlist, userId }) {
  const { tickers, newLastTicker } = detectTickers(userText, lastTicker);

  try {
    console.log('[askUpTikAI] Using NEW pipeline for:', userText);
    // Get current user ID from session if not passed
    let uid = userId;
    if (!uid) {
      const { data: { session } } = await supabase.auth.getSession();
      uid = session?.user?.id;
    }

    const result = await runPipeline(userText, history, supabase, uid, lastTicker);
    console.log(`[AI Pipeline] agent=${result.meta.agent} cached=${result.meta.cached} ms=${result.meta.ms}`);
    return { text: result.reply, newLastTicker: result.meta.ticker || newLastTicker };
  } catch (err) {
    console.warn('[AI Pipeline] FAILED — falling back to legacy. Error:', err.message, err);
    // Fallback to legacy direct call
    return await legacyAskAI({ userText, history, tickers, newLastTicker, username, groupName, watchlist });
  }
}

// Legacy fallback — original Sonnet-only implementation
async function legacyAskAI({ userText, history, tickers, newLastTicker, username, groupName, watchlist }) {
  const stockContext = await fetchStockContext(tickers);
  const messages = [...history, { role: 'user', content: userText }];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: buildSystemPrompt({ username, groupName, watchlist, stockContext }),
      messages,
    }),
  });

  const data = await res.json();
  const text = stripMarkdown(data.content?.[0]?.text || 'Unable to respond right now. Try again shortly.');
  return { text, newLastTicker };
}
