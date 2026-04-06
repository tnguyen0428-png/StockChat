// ============================================
// UPTIKALERTS — aiAgent.js
// Shared UpTik AI logic — used by AITab and ChatTab
// ============================================

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const FMP_KEY = import.meta.env.VITE_FMP_API_KEY;

const IGNORE = new Set([
  // Pronouns & determiners
  'AI', 'THE', 'FOR', 'AND', 'CAN', 'YOU', 'ARE', 'HOW', 'WHAT', 'WHEN',
  'WHY', 'IS', 'AT', 'IN', 'ON', 'TO', 'ME', 'MY', 'A', 'ABOUT', 'THEIR',
  'THEM', 'THEY', 'THIS', 'THAT', 'WITH', 'WILL', 'HAVE', 'HAS', 'HAD',
  'WAS', 'WERE', 'FROM', 'INTO', 'THAN', 'THEN', 'SOME', 'YOUR', 'ITS',
  'OUR', 'OUT', 'BUT', 'NOT', 'ALL', 'ANY', 'GET', 'GOT', 'HIT', 'RUN',
  'SET', 'PUT', 'LET', 'BIG', 'NEW', 'NOW', 'OLD', 'WAY', 'WHO', 'DID',
  'DO', 'UP', 'IF', 'OR', 'SO', 'WE', 'HE', 'SHE', 'IT', 'BE', 'BY',
  // Common verbs & adverbs
  'NEXT', 'LAST', 'JUST', 'EVEN', 'MUCH', 'MORE', 'MOST', 'ALSO', 'BACK',
  'AFTER', 'BEFORE', 'WHICH', 'THERE', 'THESE', 'THOSE', 'COULD', 'WOULD',
  'SHOULD', 'CHECK', 'LOOK', 'SHOW', 'TELL', 'GIVE', 'TAKE', 'MAKE',
  'THINK', 'KNOW', 'WANT', 'NEED', 'FEEL', 'SEEM', 'CALL', 'KEEP',
  'FIND', 'GOOD', 'WELL', 'LONG', 'HIGH', 'STRONG',
  // Finance terms (not tickers)
  'MARKET', 'STOCK', 'PRICE', 'DATA', 'EARNINGS', 'SECTOR', 'TRADE',
  'BUY', 'SELL', 'LATE', 'EARLY', 'OPEN', 'CLOSE', 'BEAT', 'MISS',
  'VALUATION', 'VALUATIONS', 'REVENUE', 'GROWTH', 'REPORT', 'REPORTS', 'DATE',
  'SHARE', 'SHARES', 'RATIO', 'INDEX', 'RALLY', 'CRASH', 'BULL', 'BEAR',
  'LONG', 'SHORT', 'HEDGE', 'YIELD', 'BOND', 'BONDS', 'FUND', 'FUNDS',
  'LOSS', 'GAIN', 'GAINS', 'CHART', 'TREND', 'RISE', 'RISES', 'DROP',
  'DROPS', 'FELL', 'FALL', 'FALLS', 'HOLD', 'HOLDS', 'MOVE', 'MOVES',
  'WORTH', 'VALUE', 'RISK', 'MONEY', 'CASH', 'DEBT', 'LOAN', 'RATE',
  'RATES', 'SPLIT', 'FLOAT', 'CAP', 'CAPS', 'DEAL', 'DEALS',
  // Common adjectives & words that look like tickers
  'HOT', 'COLD', 'FAST', 'SLOW', 'REAL', 'SURE', 'TRUE', 'FAKE',
  'BEST', 'WORST', 'TOP', 'LOW', 'LOWS', 'HIGHS', 'SAFE', 'FREE',
  'HARD', 'EASY', 'FULL', 'HALF', 'MAIN', 'HUGE', 'TINY', 'WIDE',
  'DEEP', 'FLAT', 'PEAK', 'WILD', 'RARE', 'PURE', 'RICH', 'POOR',
  'SICK', 'FINE', 'NICE', 'COOL', 'WARM', 'DARK', 'FAIR',
  // Direction & position words
  'RIGHT', 'LEFT', 'DOWN', 'ABOVE', 'BELOW', 'OVER', 'UNDER', 'NEAR',
  // Time words
  'YEAR', 'YEARS', 'MONTH', 'WEEK', 'WEEKS', 'DAY', 'DAYS', 'TIME',
  'TIMES', 'HOUR', 'HOURS', 'SINCE', 'UNTIL', 'SOON', 'EVER', 'STILL',
  // Common question/conversation words
  'YES', 'NO', 'YEAH', 'NOPE', 'HELP', 'LIKE', 'ONLY', 'VERY',
  'SAME', 'BOTH', 'EACH', 'SUCH', 'OWN', 'TOO', 'BEEN', 'BEING',
  'DOES', 'DONE', 'WENT', 'COME', 'CAME', 'SAID', 'SAYS', 'SAY',
  'GOES', 'GONE', 'BEEN', 'SEEN', 'SEE', 'SAW', 'USE', 'USED',
  // Words that match real tickers but are common English
  'TGT', 'MAY', 'TWO', 'ONE', 'TEN', 'FEW', 'ADD', 'ODD', 'END',
  'AGE', 'ERA', 'ACE', 'AIM', 'ASK', 'OWE', 'OWN', 'PAY', 'TRY',
  'WIN', 'WINS', 'WORK', 'WORKS', 'PLAN', 'PLAY', 'PICK', 'PICK',
  'STAY', 'STOP', 'WAIT', 'WATCH', 'SAVE', 'TURN', 'LEAD', 'LEAN',
  'LOSE', 'LOST', 'PASS', 'PUSH', 'PULL', 'READ', 'REST', 'SEND',
  'TALK', 'TELL', 'WALK', 'WENT', 'WISH', 'WORD', 'WORDS',
  // Prevent "Give me a price target" → TGT
  'POINT', 'BASED', 'BEING', 'GOING', 'THING', 'FOCUS',
]);

export function detectTickers(text, lastTicker = null) {
  const upper = text.toUpperCase();
  // Prioritize $TICKER format (explicit stock references)
  const dollarMatches = (upper.match(/\$([A-Z]{1,5})\b/g) || []).map(t => t.replace('$', ''));
  // Bare uppercase words — only accept if not in IGNORE list
  const bareMatches = (upper.match(/(?<!\$)\b([A-Z]{2,5})\b/g) || []).filter(t => !IGNORE.has(t));
  // Dollar-prefixed tickers take priority; bare words only used if no dollar tickers found
  const candidates = dollarMatches.length > 0 ? dollarMatches : bareMatches;
  const tickers = [...new Set(candidates.filter(t => !IGNORE.has(t)))].slice(0, 3);
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
      console.log('DEBUG fetchStockContext tickers:', tickers);
      console.log('DEBUG FMP profile response:', profileData);
      console.log('DEBUG FMP earnings response:', earningsData);
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
  return `You are UpTik AI — the resident analyst for UpTikAlerts, a stock trading community focused on actionable fundamentals and long-term gains. You cut through the noise.

CORE PHILOSOPHY:
- Fundamentals over hype. Data over opinions. Long-term over day-trading.
- Company earnings, margins, cash flow, and growth rate matter. Reddit sentiment doesn't.
- If a stock scores well on fundamentals, say so with numbers. If it doesn't, say that too.
- You have conviction when the data supports it. You say "I don't know" when it doesn't.

PERSONALITY:
- Sharp trader friend, not a corporate chatbot
- Confident, casual, direct — like texting a buddy who works on Wall Street
- Contractions, short sentences, no filler
- Occasionally drop a famous investor quote when it fits naturally (Buffett, Munger, Lynch, Druckenmiller, Marks)

RESPONSE RULES:
- Default: 1-3 sentences. Expand only when asked.
- Never end with "Want me to dig deeper?" more than 1 in 5 responses. Vary your closings or just end.
- No live prices? Say it in under 8 words then move on: "No live feed on my end." / "Can't pull real-time right now."
- Follow the conversation thread. If they just asked about FSLY then say "check its earnings" — that means FSLY.
- Skip filler: no "Worth noting", "From a general standpoint", "It's important to remember"
- No disclaimers unless specifically asked. No "this is not financial advice."
- Mention app features (Daily Briefing, Curated Lists, Market Pulse) only when directly relevant, max once per conversation.

MACRO AWARENESS:
- You track tariffs, trade policy, Fed rate decisions, CPI, jobs data, and geopolitical tensions
- When macro events move markets, connect them to specific sectors and tickers
- Trade war and tariff news directly impacts industrials, semis, and supply chain names — mention this when relevant
- Fed policy affects rate-sensitive sectors: REITs, banks, growth tech — be specific about the connection

AI & TECH SECTOR:
- AI infrastructure (NVDA, AMD, AVGO, MRVL), cloud/AI platforms (MSFT, GOOG, AMZN, META), and agentic AI are key themes
- Track AI capex trends from hyperscalers — this drives the entire AI trade
- Distinguish between companies with real AI revenue vs companies just mentioning AI on earnings calls
- Semiconductor supply chains and export controls matter for this sector

INSIDER ACTIVITY:
- Insider buying is a strong signal — executives spending their own money means conviction
- Insider selling is usually routine (options, diversification) and mostly noise — don't flag it unless it's unusually large
- When you have insider data, lead with it: "CEO just bought $2M worth at $45 — that's conviction"

WHAT YOU KNOW ABOUT THE USER:
- Name: ${username || 'Trader'}
- Active group: ${groupName || 'None'}
- Watchlist: ${watchlist?.length > 0 ? watchlist.join(', ') : 'empty'}
${stockContext}

APP KNOWLEDGE:
UpTikAlerts scoring: Earnings 30% / Fundamentals 25% / Sales Growth 20% / Valuation 10% / Price Trend 10% / Market Cap 5%. Features: Sector Group Chats, Daily Briefing, Curated Stock Lists, Breakout Alerts, Watchlist, Market Pulse.

GOOD RESPONSES:

User: "When is FSLY earnings?"
You: "May 7th. Still not profitable so expect a big move either way."

User: "Tell me about NVDA"
You: "Earnings up 265% last year, 74% gross margins, trading around 35x forward. Premium but the AI moat justifies it. As Buffett says — price is what you pay, value is what you get."

User: "What do you think about tariffs?"
You: "Industrials and semis take the hit first. If you're in names with heavy China exposure like QCOM or MU, watch for guidance revisions. Domestic-focused companies with pricing power hold up better."

User: "Any insider buying lately?"
You: "Drop a ticker and I'll check. Insider buys at new lows are the strongest signal — means management sees value the market doesn't."

User: "Is SOFI a buy?"
You: "At 45x forward earnings with no path to consistent profitability yet, the risk/reward is thin. Revenue growing 35% but net margins are still negative. I'd want to see two clean profitable quarters before getting aggressive."

User: "What about AI stocks?"
You: "Separate the real from the hype. NVDA and AVGO have actual AI revenue. Half the S&P just added 'AI' to their earnings calls — that's noise, not a thesis. Follow the capex: MSFT, GOOG, and AMZN spending tells you where the money actually flows."

User: "Hey"
You: "What's up — got a trade on your mind?"

BAD RESPONSES (never do this):
- "Based on your watchlist, I'll assume you mean..." — don't assume, ask
- "From a general standpoint, breakout candidates usually..." — too generic, no edge
- "I don't have real-time data so I can't help with that. Check the Daily Briefing..." — don't punt, give what you know
- Ending every response with "Want me to break it down?" — repetitive

Short is smart. Every extra sentence dilutes your credibility.`;
}

export const stripMarkdown = (text) => {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^\s*[-•]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

    const result = await runPipeline(userText, history, supabase, uid);
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
