import { callClaude } from './callClaude';

export const macroAgent = {
  async fetchContext(supabase) {
    // Fetch today's alerts to see which sectors are active
    const { data: alerts } = await supabase
      .from('breakout_alerts')
      .select('ticker, sector, scanner_tag, change_percent, confidence')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('confidence', { ascending: false })
      .limit(10);

    // Try to get SPY and QQQ prices for market overview
    let marketData = null;
    try {
      const { lookupPrice } = await import('../tools/priceLookup.js');
      const [spy, qqq, vix] = await Promise.allSettled([
        lookupPrice('SPY'),
        lookupPrice('QQQ'),
        lookupPrice('VIX'),
      ]);
      marketData = {
        spy: spy.status === 'fulfilled' ? spy.value : null,
        qqq: qqq.status === 'fulfilled' ? qqq.value : null,
        vix: vix.status === 'fulfilled' ? vix.value : null,
      };
    } catch {}

    // Summarize which sectors are alerting today
    const sectors = {};
    (alerts || []).forEach(a => {
      if (a.sector) sectors[a.sector] = (sectors[a.sector] || 0) + 1;
    });

    return {
      marketData,
      activeSectors: sectors,
      alertCount: (alerts || []).length,
      topAlerts: (alerts || []).slice(0, 5).map(a =>
        `${a.ticker} ${a.change_percent >= 0 ? '+' : ''}${a.change_percent}% (${a.scanner_tag})`
      ).join(', '),
      hasData: marketData !== null,
    };
  },

  async respond(question, history, context, memory) {
    const level = memory?.level || 'beginner';
    const m = context.marketData;

    const systemPrompt = `CRITICAL: Maximum 2 sentences. That's it. Two sentences. If you wrote three, delete one.

FORMAT: [Fact] + [So what]. That's the formula. First sentence is the fact. Second sentence is why it matters. Done.

EXAMPLES:
"Oil is up 4% today. That's good for Exxon and Chevron but bad for airlines and shipping companies."
"The Fed kept interest rates the same. That means borrowing money stays expensive, which usually slows the economy down a bit."

You are UpTik AI, a market overview assistant. You explain the big picture — the economy, the Fed, inflation, sectors, and overall market direction.

TONE: You explain the economy the way a smart friend would over coffee. Simple, clear, no jargon. If a 16-year-old couldn't understand it, rewrite it.
USER LEVEL: ${level} — ${level === 'beginner' ? 'Simple words only. Explain every concept. No jargon.' : level === 'intermediate' ? 'Some trading terms fine. Dont over-explain basics.' : 'Technical language fine. Be direct and data-heavy.'}

MARKET DATA RIGHT NOW:
${m?.spy ? `S&P 500 (SPY): $${m.spy.price} (${m.spy.changePercent >= 0 ? '+' : ''}${m.spy.changePercent?.toFixed(2)}%)` : 'SPY data unavailable'}
${m?.qqq ? `Nasdaq (QQQ): $${m.qqq.price} (${m.qqq.changePercent >= 0 ? '+' : ''}${m.qqq.changePercent?.toFixed(2)}%)` : 'QQQ data unavailable'}
${m?.vix ? `Fear Index (VIX): ${m.vix.price} — ${m.vix.price > 30 ? 'high fear, market is nervous' : m.vix.price > 20 ? 'moderate caution' : 'calm, market feels safe'}` : 'VIX data unavailable'}

ACTIVE SECTORS TODAY: ${Object.entries(context.activeSectors).map(([s, c]) => `${s} (${c} alerts)`).join(', ') || 'None alerting'}
TOP MOVERS: ${context.topAlerts || 'None'}

LANGUAGE RULES:
- Never use: "macro environment", "monetary policy tightening", "dovish/hawkish", "quantitative easing", "yield curve inversion", "risk-on/risk-off"
- Instead say: "the Fed is raising/lowering interest rates", "borrowing money is getting more/less expensive", "investors are feeling nervous/confident", "shorter-term bonds paying more than longer-term ones (which is unusual and often a warning sign)"
- Use the actual market numbers from above — don't make up prices
- For "how's the market" questions, lead with SPY direction and VIX fear level, then mention active sectors
- One idea per sentence. Short sentences.
- NEVER end with a question. No "Want to know more?" No "What else?" Just answer and stop.
- NEVER give background info they didn't ask for. Answer the question, that's it.
- Not financial advice.`;

    return await callClaude(systemPrompt, question, history, 'auto');
  }
};
