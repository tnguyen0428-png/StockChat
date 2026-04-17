import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const url = new URL(req.url);
    const ticker = url.searchParams.get("ticker")?.toUpperCase();
    if (!ticker) return new Response(JSON.stringify({ error: "Missing ticker param" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("POLYGON_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "Polygon key not configured" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

    // Try snapshot first
    const snapRes = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${apiKey}`);
    const snapJson = await snapRes.json();
    const t = snapJson.ticker;

    if (t) {
      const hasToday = t.day?.c > 0 || t.lastTrade?.p > 0;
      const price = t.lastTrade?.p || t.day?.c || t.prevDay?.c || null;
      if (price) {
        return new Response(JSON.stringify({
          ticker, price,
          change: hasToday ? t.todaysChange : null,
          changePercent: hasToday ? t.todaysChangePerc : null,
          volume: hasToday ? t.day?.v : t.prevDay?.v || null,
          dayHigh: hasToday ? t.day?.h : t.prevDay?.h || null,
          dayLow: hasToday ? t.day?.l : t.prevDay?.l || null,
          prevClose: t.prevDay?.c || null,
          marketOpen: hasToday,
        }), { headers: { ...CORS, "Content-Type": "application/json" } });
      }
    }

    // Fallback: previous day close
    const prevRes = await fetch(`https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?apiKey=${apiKey}`);
    const prevJson = await prevRes.json();
    if (prevJson.results?.length > 0) {
      const p = prevJson.results[0];
      return new Response(JSON.stringify({
        ticker, price: p.c, change: null, changePercent: null,
        volume: p.v, dayHigh: p.h, dayLow: p.l, prevClose: p.c,
        marketOpen: false,
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ticker, price: null }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
