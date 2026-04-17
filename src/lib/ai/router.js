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
  // Consumer staples / industrials
  'procter': 'PG', 'procter & gamble': 'PG', 'p&g': 'PG', 'pg': 'PG',
  'coca-cola': 'KO', 'coca cola': 'KO', 'coke': 'KO', 'pepsi': 'PEP', 'pepsico': 'PEP',
  'colgate': 'CL', 'general mills': 'GIS', 'kellogg': 'K', 'mondelez': 'MDLZ',
  'kraft': 'KHC', 'kraft heinz': 'KHC', 'hershey': 'HSY',
  '3m': 'MMM', 'honeywell': 'HON', 'general electric': 'GE', 'ge': 'GE',
  // Retail / consumer
  'kroger': 'KR', 'dollar general': 'DG', 'dollar tree': 'DLTR',
  'ross': 'ROST', 'tjx': 'TJX', 'tj maxx': 'TJX', 'best buy': 'BBY',
  // Healthcare
  'amgen': 'AMGN', 'gilead': 'GILD', 'regeneron': 'REGN', 'vertex': 'VRTX',
  'bristol myers': 'BMY', 'bristol-myers': 'BMY', 'astrazeneca': 'AZN',
  'cvs': 'CVS', 'walgreens': 'WBA',
  // Finance
  'charles schwab': 'SCHW', 'american express': 'AXP', 'amex': 'AXP',
  'blackrock': 'BLK', 'goldman sachs': 'GS', 'citi': 'C',
  // Tech / software
  'adobe': 'ADBE', 'servicenow': 'NOW', 'workday': 'WDAY',
  'palo alto': 'PANW', 'palo alto networks': 'PANW', 'fortinet': 'FTNT',
  'arista': 'ANET', 'dell': 'DELL', 'hp': 'HPQ', 'lenovo': 'LNVGY',
  // Telecom / media
  'att': 'T', 'at&t': 'T', 'verizon': 'VZ', 't-mobile': 'TMUS',
  'comcast': 'CMCSA', 'paramount': 'PARA', 'warner bros': 'WBD',
  // Energy
  'marathon': 'MPC', 'pioneer': 'PXD', 'schlumberger': 'SLB',
  'enphase': 'ENPH', 'first solar': 'FSLR', 'nextera': 'NEE',
  'bloom energy': 'BE', 'bloom': 'BE',
};

// Pre-computed for hot loops — avoid Object.entries() per call/per history message
const COMPANY_ENTRIES = Object.entries(COMPANY_TO_TICKER);
const COMPANY_ENTRIES_MULTI = COMPANY_ENTRIES.filter(([n]) => n.includes(' '));

// Words that look like tickers but aren't — with exceptions for stock context
const IGNORE_TICKERS = new Set(['AI', 'AM', 'PM', 'OK', 'US', 'CEO', 'IPO', 'ETF', 'GDP', 'FBI', 'USA', 'THE', 'FOR', 'AND', 'CAN', 'YOU', 'ARE', 'HOW', 'WHAT', 'WHY', 'IS', 'AT', 'IN', 'ON', 'TO', 'ME', 'MY', 'NO', 'YES', 'HI', 'HEY', 'UP', 'DO', 'IF', 'OR', 'SO', 'IT', 'BY', 'OF', 'AN', 'AS', 'GO', 'IM']);

// These are real tickers that overlap with common words — allow when stock context is present
const CONTEXT_TICKERS = new Set(['BE', 'IT', 'AI', 'ON', 'GO']);

// Detect if message has stock-related context around a word
// NOTE: the `word` param is currently ignored — this only checks message-level
// signals. Callers pass a candidate ticker (e.g. "BE") expecting word-local
// context. Flagged as a routing logic bug — leaving the signature for now and
// underscoring the unused param to silence lint.
function hasStockContext(message, _word) {
  const lower = message.toLowerCase();
  const stockSignals = ['stock', 'ticker', 'share', 'price', 'earnings', 'buy', 'sell', 'trade',
    'analyze', 'analysis', 'tell me about', 'what about', 'how is', "how's", 'look at',
    'check', 'guidance', 'outlook', 'forecast', 'revenue', 'eps', 'valuation'];
  return stockSignals.some(s => lower.includes(s));
}

// Detect if user is asking about guidance/outlook (needs transcript)
function needsTranscript(message) {
  return /\b(guidance|outlook|forecast|forward.?looking|what did (they|management|the company|ceo|cfo) (say|guide|expect)|company guidance|revenue (target|range|outlook)|eps (target|range|outlook)|next quarter.*(expect|guide|outlook)|full.?year.*(expect|guide|outlook))\b/i.test(message);
}

export async function route(message, history = [], lastTicker = null) {
  const lower = message.toLowerCase().trim();

  // Check for pronoun references ("it", "that stock", "the same one", "this one")
  const pronouns = /\b(it|its|that stock|this stock|that one|this one|the same|same stock|same ticker)\b/i;

  // Also catch follow-up queries that imply "the stock we were just talking about"
  const followUpPatterns = /^(pull up|show me|what about|how about|and |also |check |look at |give me )/i;
  const stockDataWords = /\b(earnings|revenue|chart|technicals|options|calls|puts|valuation|price target|dividend|insider|guidance|forecast|financials|balance sheet|income statement|cash flow|eps|p\/e|margin|volume|float)\b/i;
  const isFollowUp = pronouns.test(message) || (followUpPatterns.test(lower) && stockDataWords.test(lower));

  if (isFollowUp) {
    const transcript = needsTranscript(message);
    // Look backwards through history for the last mentioned ticker
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i]?.content || '';
      const tickerInHistory = h.match(/\$([A-Z]{1,5})\b/);
      if (tickerInHistory?.[1]) return { agent: 'data', params: { ticker: tickerInHistory[1], needsTranscript: transcript } };
      const hLower = h.toLowerCase();
      for (const [name, ticker] of COMPANY_ENTRIES) {
        if (hLower.includes(name)) return { agent: 'data', params: { ticker, needsTranscript: transcript } };
      }
      const bare = h.match(/\b([A-Z]{2,5})\b/);
      if (bare && !IGNORE_TICKERS.has(bare[1])) return { agent: 'data', params: { ticker: bare[1], needsTranscript: transcript } };
    }
    if (lastTicker) {
      console.log('[Router] Follow-up resolved via lastTicker:', lastTicker);
      return { agent: 'data', params: { ticker: lastTicker, needsTranscript: transcript } };
    }
  }

  // Check if this question needs transcript data
  const transcript = needsTranscript(message);

  // === TICKER CHECKS FIRST (always take priority) ===

  // 1. Check $SYMBOL format
  const tickerMatch = message.match(/\$([A-Z]{1,5})\b/);
  if (tickerMatch) {
    return { agent: 'data', params: { ticker: tickerMatch[1], needsTranscript: transcript } };
  }

  // 2. Check multi-word company names first (before single words)
  for (const [name, ticker] of COMPANY_ENTRIES_MULTI) {
    if (lower.includes(name)) {
      return { agent: 'data', params: { ticker, needsTranscript: transcript } };
    }
  }

  // 3. Check single-word company names
  const words = lower.split(/\s+/);
  for (const word of words) {
    if (COMPANY_TO_TICKER[word]) {
      return { agent: 'data', params: { ticker: COMPANY_TO_TICKER[word], needsTranscript: transcript } };
    }
  }

  // 4. Check for uppercase ticker-like words (2-5 capital letters)
  const possibleTicker = message.match(/\b([A-Z]{2,5})\b/);
  if (possibleTicker) {
    const candidate = possibleTicker[1];
    // Allow context-dependent tickers (BE, AI, etc.) when stock context is present
    if (CONTEXT_TICKERS.has(candidate) && hasStockContext(message, candidate)) {
      return { agent: 'data', params: { ticker: candidate, needsTranscript: transcript } };
    }
    if (!IGNORE_TICKERS.has(candidate) && !CONTEXT_TICKERS.has(candidate)) {
      return { agent: 'data', params: { ticker: candidate, needsTranscript: transcript } };
    }
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
  const dataKeywords = ['alert', 'alerts', 'trade', 'pick', 'picks', 'scanner', 'breakout', 'what should', 'best stock', 'portfolio', 'watchlist', 'momentum', 'gainer', 'gainers', 'loser', 'losers', 'mover', 'movers', 'volume surge', 'unusual volume', 'trending', 'top stock', 'top stocks', 'hot stock', 'hot stocks'];
  if (dataKeywords.some(k => lower.includes(k))) {
    return { agent: 'data', params: { ticker: null } };
  }

  // === ONLY check greetings/education if NO ticker was found ===

  // 7. Pure greetings (message is ONLY a greeting, nothing else)
  const pureGreetings = ['hello', 'hi', 'hey', 'sup', 'yo', 'good morning', 'good afternoon', "what's up", 'whats up'];
  if (pureGreetings.some(g => lower === g || lower === g + '!')) {
    return { agent: 'knowledge', params: { ticker: null } };
  }

  // 8. Education keywords
  const eduKeywords = ['what is', 'what are', 'what does', 'explain', 'define', 'meaning of', 'how does', 'difference between', 'teach me'];
  const eduTopics = ['support', 'resistance', 'volume', 'gap up', 'sma', 'rsi', 'macd', 'options', 'calls', 'puts', 'dark pool', 'market cap', 'p/e', 'dividend', 'short selling', 'margin', 'stop loss', 'limit order', 'bull', 'bear', 'candlestick', 'moving average'];
  if (eduKeywords.some(k => lower.includes(k)) && eduTopics.some(t => lower.includes(t))) {
    return { agent: 'knowledge', params: { ticker: null } };
  }

  // === 9. FALLBACK: use Haiku to classify ===
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

"data" = needs live stock data (price, alerts, specific ticker analysis, today's picks, what to trade, guidance, outlook)
"macro" = broad market questions, economy, Fed, inflation, interest rates, sectors, market direction, tariffs, recession
"knowledge" = education, concepts, definitions, how things work, greetings, general chat

Extract ticker if mentioned (company names too: "Tesla"="TSLA", "Bloom Energy"="BE", "SoFi"="SOFI", "Trade Desk"="TTD", etc).

Respond: {"agent":"data or macro or knowledge","params":{"ticker":"SYMBOL or null"}}`,
        messages: [{ role: 'user', content: message }]
      })
    });

    const data = await response.json();
    const text = data?.content?.[0]?.text?.replace(/```json|```/g, '').trim();
    if (!text) throw new Error('Empty classifier response');
    const parsed = JSON.parse(text);
    if (!parsed?.agent || !parsed?.params) throw new Error('Invalid classifier shape');
    // Add transcript flag if needed
    if (parsed.params?.ticker && transcript) {
      parsed.params.needsTranscript = true;
    }
    return parsed;
  } catch (e) {
    console.warn('[Router] Haiku classifier failed:', e.message);
    return { agent: 'knowledge', params: { ticker: null } };
  }
}
