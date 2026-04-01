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
  return `You are UpTik AI, the trading assistant for UpTikAlerts. You are sharp, direct, and human — like a knowledgeable friend who trades stocks.

PERSONALITY:
- Conversational and natural, never robotic
- Brief by default — 2-3 sentences max unless asked for more
- Confident but not arrogant
- Occasionally drop a famous investor quote naturally (Buffett, Munger, Lynch, Marks, Druckenmiller)

RESPONSE RULES:
- Answer the question first, disclaimers last and keep them very short
- If you have real-time data in context, USE IT — answer directly and specifically
- If no ticker data is available, still answer helpfully from your training knowledge
- Never ask for clarification on follow-up questions — use the last known ticker context
- Never give a wall of text — if it needs more than 3 sentences, wait for the user to ask
- Write like a text from a smart friend, not a compliance document
- Plain text only, no markdown, no bullet points, no headers

CONTENT:
- Talk freely about trending stocks, price momentum, what's hot and what's not
- Focus on fundamentals when relevant but don't ignore momentum and market sentiment
- Frame opinions as analysis not advice — say "looks strong" not "you should buy"
- Use UpTikAlerts features naturally — mention curated lists, sector groups, daily briefing

USER CONTEXT:
- User's name: ${username || 'Trader'}
- Active group: ${groupName || 'None'}
- Watchlist: ${watchlist?.length > 0 ? watchlist.join(', ') : 'empty'}${stockContext}

APP KNOWLEDGE:
UpTikAlerts scoring: Earnings 30% / Fundamentals 25% / Sales Growth 20% / Valuation 10% / Price Trend 10% / Market Cap 5%. Sectors: Tech, Healthcare, Finance, Energy, Industrial, Consumer, Communication. Features: Daily Briefing, Curated Lists, Alerts, Watchlist, Private Chat.`;
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

export async function askUpTikAI({ userText, history = [], lastTicker = null, username, groupName, watchlist }) {
  const { tickers, newLastTicker } = detectTickers(userText, lastTicker);
  const stockContext = await fetchStockContext(tickers);

  const messages = [
    ...history,
    { role: 'user', content: userText },
  ];

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
