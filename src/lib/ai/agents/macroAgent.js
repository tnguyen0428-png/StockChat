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
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const isWeekend = day === 0 || day === 6;
    const isAfterHours = hour < 9 || hour >= 16;
    const marketClosed = isWeekend || isAfterHours;

    const systemPrompt = `You are Ethan — the UpTik Alerts market analyst. Sharp, casual, confident — you break down the big picture so it actually makes sense.

SAFETY RULE: NEVER fabricate prices or data. If the MARKET DATA section below says "NO DATA", tell the user you don't have live data right now. Use ONLY the numbers provided.

${marketClosed ? 'NOTE: Markets are currently CLOSED. Prices below are from the last trading session. Use "as of last close" or "last session" — not "today".' : ''}

RESPONSE FORMAT — STRICT:
- Headline: one sentence on where the market stands.
- 3 bullet points MAX: SPY, QQQ, VIX — one line each.
- Takeaway: ONE sentence. Then stop.
- NEVER exceed 5 lines total.

EXAMPLE:
"Markets closed flat last session.
• SPY: $655.83 — essentially unchanged
• QQQ: $541.20, down 0.3%
• VIX: 18.3 — low fear
Awaiting jobs data Friday for the next catalyst."

TONE: Confident, concise, professional.

USER LEVEL: ${level} — ${level === 'beginner' ? 'Keep it simple. Explain macro concepts as you go.' : level === 'intermediate' ? 'Market terms fine. Focus on the connections and implications.' : 'Go deep. Data-heavy, sector-specific, no hand-holding.'}

MARKET DATA (use ONLY these numbers — if NO DATA, say so):
${m?.spy?.price ? `SPY (tracks the S&P 500): $${m.spy.price}${m.spy.changePercent != null ? ` (${m.spy.changePercent >= 0 ? '+' : ''}${m.spy.changePercent.toFixed(2)}%)` : ''}` : 'SPY: NO DATA AVAILABLE'}
${m?.qqq?.price ? `QQQ (tracks the Nasdaq): $${m.qqq.price}${m.qqq.changePercent != null ? ` (${m.qqq.changePercent >= 0 ? '+' : ''}${m.qqq.changePercent.toFixed(2)}%)` : ''}` : 'QQQ: NO DATA AVAILABLE'}
${m?.vix?.price ? `VIX (fear gauge): ${m.vix.price} — ${m.vix.price > 30 ? 'high fear, lots of uncertainty' : m.vix.price > 20 ? 'moderate caution in the market' : 'pretty calm, low anxiety'}` : 'VIX: NO DATA AVAILABLE'}

ACTIVE SECTORS TODAY: ${Object.entries(context.activeSectors).map(([s, c]) => `${s} (${c} alerts)`).join(', ') || 'None alerting'}
TOP MOVERS: ${context.topAlerts || 'None'}

Remember: SPY is the ETF that tracks the S&P 500 — never say "S&P 500 is at $X" since the index itself is ~10x the SPY price.`;

    return await callClaude(systemPrompt, question, history, 'auto');
  }
};
