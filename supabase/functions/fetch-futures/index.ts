// ═══════════════════════════════════════
// fetch-futures — Supabase Edge Function
// Returns real-time futures data from Yahoo Finance (server-side, no CORS)
// ═══════════════════════════════════════

const FUTURES = [
  { symbol: 'ES=F', label: 'S&P Fut' },
  { symbol: 'NQ=F', label: 'Nas Fut' },
  { symbol: 'YM=F', label: 'Dow Fut' },
  { symbol: 'GC=F', label: 'Gold' },
  { symbol: 'CL=F', label: 'Oil' },
];

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    // Batch all symbols in one Yahoo v8 call per symbol (v7 often returns 403)
    const results = await Promise.all(
      FUTURES.map(async ({ symbol, label }) => {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
          const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          if (!res.ok) return null;
          const data = await res.json();
          const meta = data.chart?.result?.[0]?.meta;
          if (!meta) return null;

          const price = meta.regularMarketPrice;
          const prev = meta.previousClose ?? meta.chartPreviousClose;
          if (!price || !prev) return null;

          const pctChange = ((price - prev) / prev) * 100;
          const points = (pctChange / 100) * price;

          return { symbol, label, price, pctChange: +pctChange.toFixed(4), points: +points.toFixed(2) };
        } catch {
          return null;
        }
      })
    );

    const valid = results.filter(Boolean);

    return new Response(
      JSON.stringify({ ok: true, futures: valid, count: valid.length }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
