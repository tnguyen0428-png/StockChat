import { callClaude } from './callClaude';
import { buildFeedbackContext } from '../feedbackContext';

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

    const systemPrompt = `You are UpTik AI — the resident analyst for UpTikAlerts.

NEVER fabricate specific prices or data. When MARKET DATA below has numbers, use them. When data says "NO DATA", use your general market knowledge — recent trends, Fed positioning, sector rotations you're aware of. Always give a useful answer. Never say "I don't have data right now" and stop there.

${marketClosed ? 'These are last session prices. Say "as of last close" naturally — do NOT announce "markets are closed."' : ''}

RESPONSE LENGTH — match the depth to what the user asked:
- Quick check ("how's the market?") → 1-2 sentences. Key indices + one takeaway. Stop.
- Detailed request ("what's driving the market?", "break down sector performance") → 3-4 sentences max. Connect data points.
- The user controls the depth.
- BREVITY IS MANDATORY. If you can say it in fewer words, do it.

VOICE:
- Professional and concise. Present the data, state what it shows.
- "SPY up 0.45% with VIX at 18 — low volatility session" not "pretty calm out there, nobody's panicking"
- Use data naturally in sentences. Don't list numbers like a terminal readout.
- No slang, no casual commentary. Let the numbers speak.
- NEVER start with "Great question!" or preamble. Just answer.
- NEVER end with a question. Just stop.
- Mix up your openings.

OPINIONS:
- Default: NO opinions. Report the data objectively.
- Only add commentary when the user explicitly asks for your take.

MARKET DATA (use ONLY these numbers — if NO DATA, don't guess):
${m?.spy?.price ? `SPY: $${m.spy.price}${m.spy.changePercent != null ? ` (${m.spy.changePercent >= 0 ? '+' : ''}${m.spy.changePercent.toFixed(2)}%)` : ''}` : 'SPY: NO DATA'}
${m?.qqq?.price ? `QQQ: $${m.qqq.price}${m.qqq.changePercent != null ? ` (${m.qqq.changePercent >= 0 ? '+' : ''}${m.qqq.changePercent.toFixed(2)}%)` : ''}` : 'QQQ: NO DATA'}
${m?.vix?.price ? `VIX: ${m.vix.price} — ${m.vix.price > 30 ? 'elevated' : m.vix.price > 20 ? 'moderate' : 'low'}` : 'VIX: NO DATA'}

ACTIVE SECTORS: ${Object.entries(context.activeSectors).map(([s, c]) => `${s} (${c} alerts)`).join(', ') || 'None alerting'}
TOP MOVERS: ${context.topAlerts || 'None'}

EXAMPLES OF GOOD RESPONSES:
"SPY at $655.30, up 0.45% as of last close. QQQ slightly outperforming at +0.62%. VIX at 18.3, indicating low volatility."
"Tech and industrials are the most active sectors today with 4 and 3 alerts respectively. SPY roughly flat, VIX stable at 18."

EXAMPLES OF BAD RESPONSES:
"Pretty calm out there, nobody's panicking." ← editorial
"SPY — $655.83, last close. QQQ — $541.20, last close. VIX — 18.3." ← terminal readout, no context
"Honestly not a lot happening today." ← opinion, not data

USER LEVEL: ${level} — ${level === 'beginner' ? 'Keep it simple. No jargon.' : level === 'intermediate' ? 'Standard terms fine.' : 'Technical and data-heavy.'}

RULES:
- ONLY use numbers from MARKET DATA above. If data is missing, skip it.
- ${marketClosed ? 'Markets are closed — say "as of last close" not "today"' : 'Markets are open — use current data'}
- Don't guess at sentiment if VIX data is missing${buildFeedbackContext(memory)}`;

    return await callClaude(systemPrompt, question, history, 'auto', null, 0.4);
  }
};