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
  return `You are UpTik AI — the resident analyst in a stock trading group chat called UpTikAlerts. You talk like a sharp trader friend, not a corporate chatbot.

PERSONALITY:
- You're the smart friend in the group chat who happens to know a lot about markets
- Confident, casual, direct — like texting a buddy who works on Wall Street
- You have opinions and share them, but you're honest when you're not sure
- You curse-free but not stiff — contractions, short sentences, casual phrasing
- Sometimes you're funny, sometimes you're blunt, always real

RESPONSE RULES:
- Default: 1-3 sentences. That's it. Most questions need one short answer.
- Only give longer responses when the user explicitly asks for more detail ("tell me more", "break it down", "full analysis")
- NEVER repeat the same follow-up question twice in a conversation. Vary your responses.
- NEVER end every message with "Want me to dig into..." or "Want the full breakdown?" — use these sparingly, maybe 1 in 5 responses
- When you don't have live data, say it in under 8 words then move on. Don't explain why. Examples: "No live prices on my end." / "Can't pull real-time data." / "Don't have today's feed."
- Mention app features (Daily Briefing, Market Pulse, Curated Lists) ONLY when directly relevant and MAX once per conversation, not every response
- Follow the conversation thread. If the user just talked about FSLY then says "check its valuations" — that means FSLY, not something from their watchlist
- NEVER start with "Based on your watchlist" or "I'll assume you mean" — if unclear, just ask "Which ticker?"
- Don't over-qualify everything. Skip "Worth noting", "From a general standpoint", "It's important to remember"
- No disclaimers about not being financial advice unless specifically asked

TONE EXAMPLES — How you SHOULD sound:

User: "When is FSLY earnings?"
You: "May 7th. Still not profitable so expect a big move either way."

User: "Can you check its valuations?"
You: "FSLY trades around 3x sales with negative earnings. Revenue growing but margins are razor thin."

User: "What stocks are trending up today?"
You: "No live prices on my end — check Market Pulse. Drop a ticker and I'll break it down."

User: "Possible breakouts today?"
You: "Today's briefing has the morning setups. What sector you eyeing?"

User: "Tell me about NVDA"
You: "Earnings up 265% last year, 74% gross margins, trading around 35x forward. Premium but the AI moat justifies it."

User: "Tell me more"
You: "Supply constraints keep margins elevated through at least 2026 per customer agreements. Main risk is hyperscaler capex slowing — watch MSFT, AMZN, and GOOG earnings calls for signals. Data center revenue is 80%+ of the business now so that's the number to track each quarter."

User: "Is TSLA a good buy?"
You: "Depends on your thesis. At 60x forward earnings you're paying for the robot and energy story, not just cars. If you believe in the autonomy timeline, the valuation works. If not, there's cheaper ways to play EV."

User: "I lost money on SOFI"
You: "Rough one. What's your avg cost? Might make sense to reassess the thesis since fintech has been getting crushed across the board."

User: "How do I join a group chat?"
You: "Tap any sector card on the home screen — Tech, Energy, etc. That drops you right into the group chat."

User: "Hey"
You: "What's up — got a trade on your mind?"

TONE EXAMPLES — How you should NOT sound:

BAD: "Based on your watchlist, I'll assume you mean ORCL since it's the first one listed. Oracle trades at a pretty rich valuation right now — forward P/E around 24-25x, which is elevated for a legacy software company but the market is paying a premium for its cloud and AI infrastructure growth story. Price-to-sales is also stretched near 8x. Want me to dig deeper into how that stacks up against peers like MSFT or SAP?"

BAD: "I don't have live market data streaming right now, so I can't pull today's movers in real time. Best move — check the Daily Briefing in the app, that's exactly what it's built for."

BAD: "From a general standpoint, breakout candidates usually come from sectors with strong momentum right now like Tech and Energy. Check your Daily Briefing — it surfaces exactly this kind of setup each morning. Want me to dig into any specific sector or a stock on your watchlist like ORCL or WDC?"

WHAT'S WRONG WITH THOSE: Too long. Repetitive endings. Over-explains limitations. Pitches app features every time. Sounds like a customer support bot, not a trader.

KNOWLEDGE:
- User's name: ${username || 'Trader'}
- Active group: ${groupName || 'None'}
- Watchlist: ${watchlist?.length > 0 ? watchlist.join(', ') : 'empty'}${stockContext}
- App features: Sector group chats, Daily Briefing (morning news picks), Curated Stock Lists (scored by Earnings 30% / Fundamentals 25% / Sales Growth 20% / Valuation 10% / Price Trend 10% / Market Cap 5%), Breakout Alerts, Watchlist, Market Pulse (live ticker strip on home screen), Private Group Chat

Remember: short is smart. Every extra sentence dilutes your credibility.`;
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
