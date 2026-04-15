// ============================================
// UPTIKALERTS — generate-briefing Edge Function
// Fetches top news from Polygon, filters spam,
// pulls today's featured confluence alerts,
// gets SPY/QQQ/DIA snapshot, sends to Claude
// for a 3-5 bullet market summary, inserts into
// daily_briefings table.
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const POLYGON_BASE = 'https://api.polygon.io';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

const FILTER_OUT = [
  'class action', 'securities fraud', 'securities litigation', 'law firm',
  'lawsuit investigation', 'reminds investors', 'reminds shareholders',
  'legal action', 'filed a lawsuit', 'seeks damages',
  'sponsored content', 'paid promotion', 'advertorial',
  'penny stock', 'could 10x', 'next big thing', 'hidden gem stock',
  'under the radar stock', 'microcap alert', 'hot stock pick',
  'stock to watch before it explodes', 'massive upside potential',
  'crypto', 'cryptocurrency', 'memecoin', 'nft', 'defi', 'web3', 'token sale',
  'altcoin', 'shiba inu', 'dogecoin', 'cardano',
  'top stocks to buy', 'best stocks to buy', 'stocks to buy now',
  'top picks for', 'best investments for', 'stocks you should buy',
  'hot stocks for', 'must-buy stocks',
];

async function polyGet(path: string, apiKey: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${POLYGON_BASE}${path}${sep}apiKey=${apiKey}`);
  if (!res.ok) throw new Error(`Polygon ${path} → ${res.status}`);
  return res.json();
}

Deno.serve(async () => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const polygonKey = Deno.env.get('POLYGON_API_KEY');
    if (!polygonKey) throw new Error('Missing env var: POLYGON_API_KEY');

    const claudeKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!claudeKey) throw new Error('Missing env var: ANTHROPIC_API_KEY');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── 1. Fetch top 40 news from Polygon ──────────────────────────────────
    const newsData = await polyGet('/v2/reference/news?limit=40', polygonKey);
    const filteredNews = (newsData.results || []).filter((item: any) => {
      const text = `${item.title} ${item.description || ''}`.toLowerCase();
      return !FILTER_OUT.some(kw => text.includes(kw));
    });

    // ── 2. Fetch today's featured confluence alerts ────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: confluenceAlerts } = await supabase
      .from('breakout_alerts')
      .select('ticker, signal_type, change_pct, conviction, notes')
      .eq('signal_type', 'confluence')
      .eq('featured', true)
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    // ── 3. Fetch SPY / QQQ / DIA snapshot ────────────────────────────────
    const snapshotData = await polyGet(
      '/v2/snapshot/locale/us/markets/stocks/tickers?tickers=SPY,QQQ,DIA',
      polygonKey
    );
    const snapMap: Record<string, any> = {};
    for (const t of snapshotData.tickers || []) {
      snapMap[t.ticker] = {
        price: t.day?.c ?? t.prevDay?.c,
        change_pct: t.todaysChangePerc,
      };
    }
    const spy = snapMap['SPY'];
    const qqq = snapMap['QQQ'];
    const dia = snapMap['DIA'];

    // ── 4. Determine mood ─────────────────────────────────────────────────
    const spyChange = spy?.change_pct ?? 0;
    const mood = spyChange >= 0.5 ? 'risk-on' : spyChange <= -0.5 ? 'risk-off' : 'neutral';

    // ── 5. Build prompt for Claude ────────────────────────────────────────
    const newsLines = filteredNews.slice(0, 15).map((n: any) =>
      `• ${n.title} [${(n.tickers || []).slice(0, 3).join(', ')}]`
    ).join('\n');

    const alertLines = (confluenceAlerts || []).map((a: any) =>
      `• ${a.ticker}: ${a.notes || a.signal_type} (${a.change_pct != null ? a.change_pct.toFixed(1) + '%' : 'N/A'})`
    ).join('\n') || 'None today';

    const marketLines = [
      `SPY: ${spy?.price?.toFixed(2) ?? 'N/A'} (${spy?.change_pct?.toFixed(2) ?? '0'}%)`,
      `QQQ: ${qqq?.price?.toFixed(2) ?? 'N/A'} (${qqq?.change_pct?.toFixed(2) ?? '0'}%)`,
      `DIA: ${dia?.price?.toFixed(2) ?? 'N/A'} (${dia?.change_pct?.toFixed(2) ?? '0'}%)`,
    ].join(' | ');

    const prompt = `You are a concise market analyst. Write exactly 3-5 bullet points summarizing today's market.

MARKET SNAPSHOT: ${marketLines}
MARKET MOOD: ${mood}

TODAY'S FEATURED ALERTS:
${alertLines}

TOP NEWS HEADLINES:
${newsLines}

Rules:
- Each bullet is one clear sentence
- End each bullet with the most relevant ticker in parentheses, e.g. (AAPL) or (SPY, QQQ)
- No markdown, no headers, no numbering — just plain bullets starting with •
- Focus on what traders care about: price action, catalysts, sector moves
- 3 bullets minimum, 5 maximum`;

    // ── 6. Call Claude API ────────────────────────────────────────────────
    const claudeRes = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API error ${claudeRes.status}: ${errText}`);
    }

    const claudeJson = await claudeRes.json();
    const rawContent: string = claudeJson.content?.[0]?.text ?? '';

    // ── 7. Parse bullets into tags array ─────────────────────────────────
    const tags = rawContent
      .split('\n')
      .filter(line => line.trim().startsWith('•'))
      .map(line => {
        const clean = line.replace(/^•\s*/, '').trim();
        const tickerMatch = clean.match(/\(([^)]+)\)$/);
        const tickers = tickerMatch
          ? tickerMatch[1].split(',').map(t => t.trim())
          : [];
        const title = tickerMatch
          ? clean.replace(/\s*\([^)]+\)$/, '').trim()
          : clean;
        return { title, tickers, url: null };
      });

    if (tags.length === 0) throw new Error('Claude returned no parseable bullets');

    // ── 8. Insert into daily_briefings ────────────────────────────────────
    const { error: insertErr } = await supabase.from('daily_briefings').insert({
      content: rawContent,
      tags,
      mood,
      market_snapshot: { spy, qqq, dia },
      created_at: new Date().toISOString(),
    });

    if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);

    return new Response(
      JSON.stringify({
        ok: true,
        bullet_count: tags.length,
        mood,
        preview: tags[0]?.title ?? '',
      }),
      { headers: CORS }
    );
  } catch (err: any) {
    console.error('[generate-briefing] Error:', err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
