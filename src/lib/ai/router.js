const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const COMPANY_TO_TICKER = {
  'tesla': 'TSLA', 'apple': 'AAPL', 'nvidia': 'NVDA', 'amazon': 'AMZN',
  'google': 'GOOGL', 'alphabet': 'GOOGL', 'meta': 'META', 'facebook': 'META',
  'microsoft': 'MSFT', 'netflix': 'NFLX', 'amd': 'AMD', 'intel': 'INTC',
  'sofi': 'SOFI', 'palantir': 'PLTR', 'coinbase': 'COIN', 'shopify': 'SHOP',
  'disney': 'DIS', 'nike': 'NKE', 'walmart': 'WMT', 'costco': 'COST',
  'starbucks': 'SBUX', 'boeing': 'BA', 'uber': 'UBER', 'lyft': 'LYFT',
  'snap': 'SNAP', 'snapchat': 'SNAP', 'roku': 'ROKU', 'square': 'SQ',
  'block': 'SQ', 'paypal': 'PYPL', 'robinhood': 'HOOD', 'rivian': 'RIVN',
  'lucid': 'LCID', 'nio': 'NIO', 'snowflake': 'SNOW', 'crowdstrike': 'CRWD',
  'datadog': 'DDOG', 'unity': 'U', 'roblox': 'RBLX', 'draftkings': 'DKNG',
  'spotify': 'SPOT', 'twilio': 'TWLO', 'zoom': 'ZM', 'salesforce': 'CRM',
  'oracle': 'ORCL', 'ibm': 'IBM', 'cisco': 'CSCO', 'qualcomm': 'QCOM',
  'micron': 'MU', 'broadcom': 'AVGO', 'supermicro': 'SMCI', 'marvell': 'MRVL',
  'jpmorgan': 'JPM', 'goldman': 'GS', 'schwab': 'SCHW',
  'spy': 'SPY', 'qqq': 'QQQ', 'ark': 'ARKK', 'gamestop': 'GME', 'amc': 'AMC',
  'trade desk': 'TTD', 'the trade desk': 'TTD',
  'pltr': 'PLTR', 'crm': 'CRM', 'sq': 'SQ', 'hood': 'HOOD',
  'ttd': 'TTD', 'affirm': 'AFRM', 'toast': 'TOST',
  'doordash': 'DASH', 'airbnb': 'ABNB', 'pinterest': 'PINS',
  'morgan stanley': 'MS', 'bank of america': 'BAC', 'wells fargo': 'WFC',
  'citigroup': 'C',
  'intuitive surgical': 'ISRG', 'isrg': 'ISRG',
  'eli lilly': 'LLY', 'lilly': 'LLY', 'novo nordisk': 'NVO',
  'unitedhealth': 'UNH', 'johnson & johnson': 'JNJ', 'pfizer': 'PFE',
  'abbvie': 'ABBV', 'merck': 'MRK', 'moderna': 'MRNA',
  'berkshire': 'BRK.B', 'visa': 'V', 'mastercard': 'MA',
  'chevron': 'CVX', 'exxon': 'XOM', 'conocophillips': 'COP',
  'caterpillar': 'CAT', 'deere': 'DE', 'john deere': 'DE',
  'lockheed': 'LMT', 'raytheon': 'RTX', 'northrop': 'NOC',
  'target': 'TGT', 'home depot': 'HD', 'lowes': 'LOW', "lowe's": 'LOW',
  'chipotle': 'CMG', 'mcdonalds': 'MCD', "mcdonald's": 'MCD',
  'celsius': 'CELH', 'cava': 'CAVA', 'duolingo': 'DUOL',
};

const IGNORE_TICKERS = new Set(['AI', 'AM', 'PM', 'OK', 'US', 'CEO', 'IPO', 'ETF', 'GDP', 'FBI', 'USA', 'THE', 'FOR', 'AND', 'CAN', 'YOU', 'ARE', 'HOW', 'WHAT', 'WHY', 'IS', 'AT', 'IN', 'ON', 'TO', 'ME', 'MY', 'NO', 'YES', 'HI', 'HEY', 'UP', 'DO', 'IF', 'OR', 'SO', 'IT', 'BE', 'BY', 'OF', 'AN', 'AS', 'GO', 'IM']);

export async function route(message, history = []) {
  const lower = message.toLowerCase().trim();

  // Check for pronoun references ("it", "that stock", "the same one", "this one")
  const pronouns = /\b(it|its|that stock|this stock|that one|this one|the same|same stock|same ticker)\b/i;
  if (pronouns.test(message)) {
    // Look backwards through history for the last mentioned ticker
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i]?.content || '';
      // Check for $SYMBOL
      const tickerInHistory = h.match(/\$([A-Z]{1,5})\b/);
      if (tickerInHistory) return { agent: 'data', params: { ticker: tickerInHistory[1] } };
      // Check company names
      const hLower = h.toLowerCase();
      for (const [name, ticker] of Object.entries(COMPANY_TO_TICKER)) {
        if (hLower.includes(name)) return { agent: 'data', params: { ticker } };
      }
      // Check bare tickers
      const bare = h.match(/\b([A-Z]{2,5})\b/);
      if (bare && !IGNORE_TICKERS.has(bare[1])) return { agent: 'data', params: { ticker: bare[1] } };
    }
  }

  // === TICKER CHECKS FIRST (always take priority) ===

  // 1. Check $SYMBOL format
  const tickerMatch = message.match(/\$([A-Z]{1,5})\b/);
  if (tickerMatch) {
    return { agent: 'data', params: { ticker: tickerMatch[1] } };
  }

  // 2. Check multi-word company names first (before single words)
  for (const [name, ticker] of Object.entries(COMPANY_TO_TICKER)) {
    if (name.includes(' ') && lower.includes(name)) {
      return { agent: 'data', params: { ticker } };
    }
  }

  // 3. Check single-word company names
  const words = lower.split(/\s+/);
  for (const word of words) {
    if (COMPANY_TO_TICKER[word]) {
      return { agent: 'data', params: { ticker: COMPANY_TO_TICKER[word] } };
    }
  }

  // 4. Check for uppercase ticker-like words (2-5 capital letters)
  const possibleTicker = message.match(/\b([A-Z]{2,5})\b/);
  if (possibleTicker && !IGNORE_TICKERS.has(possibleTicker[1])) {
    return { agent: 'data', params: { ticker: possibleTicker[1] } };
  }

  // 5. Macro / market-wide questions
  const macroKeywords = ['market', 'economy', 'fed', 'federal reserve', 'inflation', 'interest rate',
    'recession', 'gdp', 'unemployment', 'jobs report', 'cpi', 'ppi', 'fomc',
    'treasury', 'bond', 'yield', 'sector', 'sectors', 'oil', 'gold',
    'how is the market', "how's the market", 'market today', 'market doing',
    'bull market', 'bear market', 'crash', 'correction', 'rally',
    'tariff', 'tariffs', 'trade war', 'debt ceiling', 'stimulus'];
  if (macroKeywords.some(k => lower.includes(k))) {
    return { agent: 'macro', params: { ticker: null } };
  }

  // 6. Data keywords (alerts, trades, specific stock questions)
  const dataKeywords = ['alert', 'alerts', 'trade', 'pick', 'picks', 'scanner', 'breakout', 'what should', 'best stock', 'portfolio', 'watchlist'];
  if (dataKeywords.some(k => lower.includes(k))) {
    return { agent: 'data', params: { ticker: null } };
  }

  // === ONLY check greetings/education if NO ticker was found ===

  // 6. Pure greetings (message is ONLY a greeting, nothing else)
  const pureGreetings = ['hello', 'hi', 'hey', 'sup', 'yo', 'good morning', 'good afternoon', "what's up", 'whats up'];
  if (pureGreetings.some(g => lower === g || lower === g + '!')) {
    return { agent: 'knowledge', params: { ticker: null } };
  }

  // 7. Education keywords
  const eduKeywords = ['what is', 'what are', 'what does', 'explain', 'define', 'meaning of', 'how does', 'difference between', 'teach me'];
  const eduTopics = ['support', 'resistance', 'volume', 'gap up', 'sma', 'rsi', 'macd', 'options', 'calls', 'puts', 'dark pool', 'market cap', 'p/e', 'dividend', 'short selling', 'margin', 'stop loss', 'limit order', 'bull', 'bear', 'candlestick', 'moving average'];
  if (eduKeywords.some(k => lower.includes(k)) && eduTopics.some(t => lower.includes(t))) {
    return { agent: 'knowledge', params: { ticker: null } };
  }

  // === 8. FALLBACK: use Haiku to classify ===
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: `Classify this stock trading app question. Respond ONLY with JSON.

"data" = needs live stock data (price, alerts, specific ticker analysis, today's picks, what to trade)
"macro" = broad market questions, economy, Fed, inflation, interest rates, sectors, market direction, tariffs, recession
"knowledge" = education, concepts, definitions, how things work, greetings, general chat

Extract ticker if mentioned (company names too: "Tesla"="TSLA", "SoFi"="SOFI", "Trade Desk"="TTD", etc).

Respond: {"agent":"data or macro or knowledge","params":{"ticker":"SYMBOL or null"}}`,
        messages: [{ role: 'user', content: message }]
      })
    });

    const data = await response.json();
    const text = data.content[0].text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch {
    return { agent: 'knowledge', params: { ticker: null } };
  }
}
